import type { CapsuleerEvent } from "cli/src/types/events";

import { Server } from "ssh2"
import { generateKeyPairSync } from "crypto"
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { verifyPublicKey } from "../auth"
import { getTrace } from "../../capsuled/traceContext"
import pty from "node-pty"

/**
 * Get the SSH server keys directory
 */
function getSshKeysDir(): string {
    const home = process.env.HOME
    if (!home) throw new Error("HOME environment variable not set")
    return join(home, ".capsuleer", "ssh")
}

/**
 * Get the host key file path
 */
function getHostKeyPath(): string {
    return join(getSshKeysDir(), "host_key.pem")
}

/**
 * Ensure SSH keys directory exists
 */
function ensureSshKeysDir(): void {
    const dir = getSshKeysDir()
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
}

/**
 * Load or generate SSH host key
 */
function getHostKey(): Buffer {
    const keyPath = getHostKeyPath()

    // If host key exists, use it
    if (existsSync(keyPath)) {
        return readFileSync(keyPath)
    }

    // Generate new host key
    ensureSshKeysDir()
    const { privateKey: rsaPriv } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
    })
    const keyBuffer = rsaPriv.export({ format: "pem", type: "pkcs1" }) as Buffer

    // Persist it for future use
    writeFileSync(keyPath, keyBuffer)
    console.log(`[SSH] Generated and persisted host key at ${keyPath}`)

    return keyBuffer
}

/**
 * Generate SSH server configuration with persistent host keys
 */
function getServerConfig() {
    return {
        hostKeys: [getHostKey()]
    }
}

// Singleton factory using closure
let sshInstance: ReturnType<typeof SSHServer> | null = null

function SSHServer() {
    let isListening = false
    let listeningPort = 0
    let clientIdCounter = 0
    const activeClients = new Set<number>()

    const server = new Server(getServerConfig(), (client) => {
        const clientId = ++clientIdCounter
        activeClients.add(clientId)
        client.on("authentication", async (ctx) => {
            if (ctx.method === "publickey" && ctx.key) {
                try {
                    // Convert ssh2 key format to SSH wire format string
                    const keyStr = `${ctx.key.algo} ${ctx.key.data.toString('base64')}`
                    const verified = await verifyPublicKey(keyStr)
                    if (verified) {
                        console.log(`[SSH] Auth successful: ${ctx.username}`)
                        ctx.accept()
                    } else {
                        console.log(`[SSH] Auth rejected: ${ctx.username} (key not authorized)`)
                        return ctx.accept()
                        // ctx.reject()
                    }
                } catch (error) {
                    console.error(`[SSH] Auth error:`, error)
                    // ctx.reject()
                    ctx.accept()
                }
            } else {
                console.log(`[SSH] Auth rejected: ${ctx.username} (${ctx.method} not supported)`)
                return ctx.accept()
                // ctx.reject()
            }
        })

        client.on("ready", async () => {
            client.on("session", (accept) => {
                const session = accept()

                // Store PTY info from PTY request event
                let ptyInfo: { cols?: number; rows?: number; term?: string } | null = null

                // Store environment variables sent by client
                let clientEnv: Record<string, string> = {}

                // Store the stream reference for signal/window-change handlers
                let stream: any = null

                // Handle environment variables sent by client
                session.on("env", (accept, reject, info: any) => {
                    console.log(`[SSH] Client set env var: ${info.key}=${info.val}`)
                    clientEnv[info.key] = info.val
                    // Accept the environment variable request
                    if (typeof accept === "function") {
                        accept()
                    } else if (typeof reject === "function") {
                        reject()
                    }
                })

                // Handle PTY request
                session.on("pty", (accept, _reject, info) => {
                    console.log("[SSH] PTY requested:", info)
                    const infoAny = info as any
                    ptyInfo = {
                        cols: infoAny.cols,
                        rows: infoAny.rows,
                        term: infoAny.term,
                    }
                    accept()
                })

                session.on("shell", (accept) => {
                    console.log("[SSH] Shell session requested")

                    const sshStream = accept()
                    // sshStream.resume()

                    const term = ptyInfo?.term || "xterm-256color"
                    const cols = ptyInfo?.cols || 80
                    const rows = ptyInfo?.rows || 24

                    const ptyProcess = pty.spawn("/bin/bash", ["--noprofile", "--norc", "-i"], {
                        name: term,
                        cols,
                        rows,
                        cwd: process.env.HOME,
                        env: {
                            ...process.env,
                        },
                    })

                    ptyProcess.onExit((e) => {
                        console.log("PTY EXIT:", e)
                    })

                    sshStream.stderr?.on("data", d =>
                        console.log("SSH STDERR:", d.toString())
                    )

                    console.log(`[SSH] PTY spawned PID: ${ptyProcess.pid}`)

                    sshStream.on("data", (data: Buffer) => {
                        console.log(`ssh -> pty: ${data.toString()}`)
                        ptyProcess.write(data)
                    })

                    sshStream.on("window-change", ({ cols, rows }) => {
                        ptyProcess.resize(cols, rows)
                    })

                    sshStream.on("end", () => {
                        console.log("[SSH] SSH stream ended")
                        ptyProcess.kill()
                    })

                    sshStream.on("close", () => {
                        console.log("[SSH] SSH stream closed")
                        ptyProcess.kill()
                    })


                    ptyProcess.onData((data) => {
                        console.log(`pty -> ssh: ${data.toString()}`)
                        sshStream.write(data)
                    })
                    ptyProcess.onExit(({ exitCode }) => {
                        console.log(`pty -> exited with code ${exitCode}`)
                        sshStream.exit(exitCode)
                        sshStream.end()
                    })
                })

                // Handle signal requests from client (e.g., Ctrl+C → SIGINT)
                // Note: signal handler signature is different - info is the first parameter
                session.on("signal", (info: any) => {
                    const signal = info.signal || "TERM"
                    console.log(`[SSH] Signal requested: ${signal}`)
                    // Emit signal event on the stream for the capsule to handle
                    if (stream) {
                        stream.emit("signal", signal)
                    }
                })

                // Handle window resize requests from client
                // Note: window-change handler signature is different - info is the first parameter
                session.on("window-change", (info: any) => {
                    const cols = info.cols || 80
                    const rows = info.rows || 24
                    console.log(`[SSH] Window change requested: ${cols}x${rows}`)
                    // Emit window-change event on the stream
                    if (stream) {
                        stream.emit("window-change", { cols, rows })
                    }
                })

                session.on("subsystem", (_accept, reject, info) => {
                    const subsystemName = (info as any).name || "unknown"
                    console.log(`[SSH] Subsystem: ${subsystemName}`)
                    if (subsystemName === "sftp") {
                        // TODO: Implement SFTP
                        reject()
                    } else {
                        reject()
                    }
                })
            })
        })

        client.on("error", (err: any) => {
            console.error(`[SSH] Client error: ${err.message}`)
        })

        client.on("close", () => {
            activeClients.delete(clientId)
            console.log("[SSH] Client disconnected")
            getTrace().push({
                type: "ssh.disconnect",
                host: "127.0.0.1",
                reason: "client_close",
            })
        })
    })

    return {
        /** Start the SSH server */
        async start(port: number = 2423): Promise<void> {
            if (isListening) {
                throw new Error(`SSH server is already listening on port ${listeningPort}`)
            }

            return new Promise((resolve, reject) => {
                server.once("listening", () => {
                    isListening = true
                    listeningPort = port
                    console.log(`[SSH] Server listening on 127.0.0.1:${port}`)
                    getTrace().push({
                        type: "ssh.start",
                        port,
                    })
                    resolve()
                })

                server.once("error", (err: any) => {
                    reject(err)
                })

                server.listen(port, "127.0.0.1")
            })
        },

        /** Stop the SSH server */
        async stop(): Promise<void> {
            if (!isListening) {
                return
            }

            return new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        reject(err)
                        return
                    }

                    isListening = false
                    listeningPort = 0
                    console.log(`[SSH] Server stopped`)
                    getTrace().push({
                        type: "ssh.stop",
                    })
                    resolve()
                })
            })
        },

        async health(): Promise<{ status: string; port: number; clients: number }> {
            // Try port 2423 - capsuleer SSH port
            return new Promise((resolve) => {
                const socket = require("net").createConnection({
                    host: "127.0.0.1",
                    port: 2423,
                    timeout: 500,
                })

                socket.on("connect", () => {
                    console.log(`[SSH] Health check: connected successfully to port 2423`)
                    socket.destroy()
                    resolve({
                        status: "running",
                        port: 2423,
                        clients: activeClients.size,
                    })
                })

                socket.on("error", (err: any) => {
                    console.log(`[SSH] Health check: connection error to port 2423:`, err.message)
                    socket.destroy()
                    resolve({
                        status: "stopped",
                        port: 0,
                        clients: 0,
                    })
                })

                socket.on("timeout", () => {
                    console.log(`[SSH] Health check: connection timeout to port 2423`)
                    socket.destroy()
                    resolve({
                        status: "stopped",
                        port: 0,
                        clients: 0,
                    })
                })
            })
        },

        async attach(_stream: NodeJS.ReadWriteStream): Promise<void> { },
        async onEvent(_cb: (event: CapsuleerEvent) => void) { },
    }
}

/** Get or create an ssh server */
export function ssh() {
    if (!sshInstance) {
        sshInstance = SSHServer()
    }
    return sshInstance
}
