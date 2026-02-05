/**
 * SSH SERVER FOR CAPSULE
 *
 * Exposes shell command execution over SSH.
 * - Listens on configurable port (default 2423)
 * - Authenticates via public key
 * - Routes SSH channels to command execution via Bun.spawn()
 * - Streams command output back over SSH
 *
 * Usage in capsule boot hook:
 *   const sshServer = await createSSHServer({ port: 2423, hostKeyPath: '/path/to/id_ed25519' })
 *   // In shutdown: await sshServer.shutdown()
 */

import { Server as SSHServer } from "ssh2"
import { readFileSync } from 'fs'

/**
 * SSH Server configuration
 */
export interface SSHServerConfig {
	/** Port to listen on (default: 2423) */
	port?: number
	/** Host to bind to (default: 'localhost') */
	host?: string
	/** Path to private key for SSH authentication */
	hostKeyPath: string
	/** Optional authentication handler - return true to accept, false to reject */
	onAuth?: (ctx: {
		username: string
		key?: { algo: string; data: Buffer }
		password?: string
	}) => boolean | Promise<boolean>
	/** Optional log function for debugging */
	log?: (msg: string, data?: unknown) => void
}

/**
 * SSH Server instance returned from createSSHServer()
 */
export interface SSHServerInstance {
	/** Get current server status */
	getStatus(): {
		running: boolean
		port?: number
		connectedClients: number
	}
	/** Gracefully shutdown the server */
	shutdown(): Promise<void>
}


export interface MinimalSSHConfig {
	hostKeyPath: string
	port?: number
	host?: string
	onAuth?: (ctx: {
		username: string
		key?: any
	}) => Promise<boolean>
	onShell: (opts: {
		stream: any
		pty?: { cols?: number; rows?: number; term?: string }
		env: Record<string, string>
		username: string
	}) => Promise<void>
}

export async function createMinimalSSHServer(config: MinimalSSHConfig) {
	const port = config.port ?? 2423
	const host = config.host ?? "127.0.0.1"

	const hostKey = readFileSync(config.hostKeyPath)

	const server = new SSHServer(
		{ hostKeys: [hostKey] },

		(client) => {
			let username = "unknown"

			/* ---------------- AUTH ---------------- */

			client.on("authentication", async (ctx: any) => {
				username = ctx.username

				if (ctx.method !== "publickey") return ctx.reject()

				if (!config.onAuth) return ctx.accept()

				try {
					const ok = await config.onAuth({
						username: ctx.username,
						key: ctx.key
					})

					ok ? ctx.accept() : ctx.reject()
				} catch {
					ctx.reject()
				}
			})

			/* ---------------- READY ---------------- */

			client.on("ready", () => {
				client.on("session", (accept) => {
					const session = accept()

					let ptyInfo:
						| { cols?: number; rows?: number; term?: string }
						| undefined

					const env: Record<string, string> = {}

					/* ---- env ---- */

					session.on("env", (accept, _reject, info: any) => {
						env[info.key] = info.val
						accept?.()
					})

					/* ---- pty ---- */

					session.on("pty", (accept, _reject, info: any) => {
						ptyInfo = {
							cols: info.cols,
							rows: info.rows,
							term: info.term
						}
						accept()
					})

					/* ---- shell ---- */

					session.on("shell", (accept) => {
						const stream = accept()

						// Forward signals (Ctrl+C etc)
						session.on("signal", (info: any) => {
							stream.emit("signal", info?.signal ?? "TERM")
						})

						config
							.onShell({
								stream,
								pty: ptyInfo,
								env,
								username
							})
							.catch((err) => {
								stream.write(`Error: ${err?.message ?? err}\n`)
								stream.end()
							})
					})
				})
			})
		}
	)

	await new Promise<void>((resolve, reject) => {
		server.listen(port, host, resolve)
		server.on("error", reject)
	})

	return {
		close() {
			return new Promise<void>((resolve) => {
				server.close(() => resolve())
			})
		}
	}
}