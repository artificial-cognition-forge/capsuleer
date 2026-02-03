import type { CapsuleerEvent } from "cli/src/types/events";

import { Server } from "ssh2"
import { generateKeyPairSync } from "crypto"
import { verifyPublicKey } from "../auth"
import { getTrace } from "../../capsuled/traceContext"

/**
 * Generate SSH server configuration with host keys
 */
function getServerConfig() {
    const { privateKey: rsaPriv } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
    })

    return {
        hostKeys: [rsaPriv.export({ format: "pem", type: "pkcs1" }) as Buffer]
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
            // if (ctx.method === "publickey") {
            //     try {
            //         // ctx.key.data contains the SSH wire format public key data
            //         // ctx.key.algo contains the key algorithm (e.g., 'ssh-ed25519')
            //         const publicKeyData = ctx.key.data // Buffer
            //         const keyAlgo = ctx.key.algo // e.g., 'ssh-ed25519'

            //         // Format: "ssh-ed25519 <base64-encoded-key> [comment]"
            //         const publicKeyB64 = publicKeyData.toString("base64")
            //         const publicKeyStr = `${keyAlgo} ${publicKeyB64}`.trim()

            //         const isAuthorized = await verifyPublicKey(publicKeyStr)

            //         if (isAuthorized) {
            //             console.log(`[SSH] Client authenticated: ${isAuthorized.name}`)
            //             ctx.accept()
            //         } else {
            //             console.log(
            //                 `[SSH] Authentication rejected: unknown public key`
            //             )
            //             ctx.reject()
            //         }
            //     } catch (error) {
            //         console.error(`[SSH] Authentication error:`, error)
            //         ctx.reject()
            //     }
            // } else {
            //     // For any other method (none, password, etc), just reject
            //     console.log(`[SSH] Rejecting ${ctx.method} auth`)
            //     ctx.reject()
            // }
        })

        client.on("ready", () => {
            client.on("session", (accept) => {
                const session = accept()

                session.on("exec", (accept, _reject, info) => {
                    console.log(`[SSH] Exec: ${info.command}`)
                    const stream = accept()

                    // Execute the command in a shell
                    const { spawn } = require("child_process")
                    const child = spawn("/bin/bash", ["-c", info.command], {
                        stdio: ["pipe", "pipe", "pipe"],
                        env: process.env
                    })

                    child.stdout.pipe(stream)
                    child.stderr.pipe(stream.stderr)
                    stream.pipe(child.stdin)

                    stream.on("close", () => {
                        console.log(`[SSH] Stream closed, killing child process`)
                        child.kill()
                    })

                    child.on("error", (err: any) => {
                        console.error(`[SSH] Child process error:`, err.message)
                        stream.stderr.write(`Error: ${err.message}\n`)
                    })

                    child.on("exit", (code: number | null) => {
                        console.log(`[SSH] Child process exited with code: ${code}`)
                        stream.exit(code || 0)
                        stream.end()
                    })
                })

                session.on("pty", (accept, _reject, info) => {
                    console.log("[SSH] PTY requested:", info)
                    accept()
                })

                session.on("shell", (accept) => {
                    console.log("[SSH] Shell requested")
                    const stream = accept()

                    // Spawn bash with proper shell configuration for interactive use
                    const { spawn } = require("child_process")
                    const child = spawn("/bin/bash", ["-i"], {
                        stdio: ["pipe", "pipe", "pipe"],
                        env: process.env
                    })

                    child.stdout.pipe(stream)
                    child.stderr.pipe(stream.stderr)
                    stream.pipe(child.stdin)

                    stream.on("close", () => {
                        child.kill()
                    })

                    child.on("exit", (code: number) => {
                        stream.exit(code || 0)
                        stream.end()
                    })

                    stream.on("signal", (signal: string) => {
                        console.log(`[SSH] Received signal: ${signal}`)
                        child.kill(signal)
                    })
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

        client.on("error", (err) => {
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
        async start(port: number = 2222): Promise<void> {
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
                    // Allow the process to exit even if server is running
                    server.unref()
                    resolve()
                })

                server.once("error", (err) => {
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
            // Try port 2222 - the default SSH port
            return new Promise((resolve) => {
                const socket = require("net").createConnection({
                    host: "127.0.0.1",
                    port: 2222,
                    timeout: 500,
                })

                socket.on("connect", () => {
                    console.log(`[SSH] Health check: connected successfully to port 2222`)
                    socket.destroy()
                    resolve({
                        status: "running",
                        port: 2222,
                        clients: activeClients.size,
                    })
                })

                socket.on("error", (err: any) => {
                    console.log(`[SSH] Health check: connection error to port 2222:`, err.message)
                    socket.destroy()
                    resolve({
                        status: "stopped",
                        port: 0,
                        clients: 0,
                    })
                })

                socket.on("timeout", () => {
                    console.log(`[SSH] Health check: connection timeout to port 2222`)
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
