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
                        ctx.reject()
                    }
                } catch (error) {
                    console.error(`[SSH] Auth error:`, error)
                    ctx.reject()
                }
            } else {
                console.log(`[SSH] Auth rejected: ${ctx.username} (${ctx.method} not supported)`)
                ctx.reject()
            }
        })

        client.on("ready", () => {
            client.on("session", (accept) => {
                const session = accept()

                // Track PTY dimensions for this session
                let ptyDims = { rows: 24, cols: 80 }
                let shellProc: any = null

                session.on("exec", (accept, _reject, info) => {
                    console.log(`[SSH] Exec: ${info.command}`)
                    const stream = accept()

                    // Execute the command using Bun.spawn
                    const proc = require("bun").spawn(["/bin/bash", "-c", info.command], {
                        stdio: ["pipe", "pipe", "pipe"],
                        env: process.env
                    })

                    // Pipe stdout to stream
                    if (proc.stdout) {
                        proc.stdout.pipe(stream)
                    }
                    // Pipe stderr to stream.stderr if available
                    if (proc.stderr && stream.stderr) {
                        proc.stderr.pipe(stream.stderr)
                    }
                    // Pipe stream input to stdin
                    stream.pipe(proc.stdin)

                    stream.on("close", () => {
                        console.log(`[SSH] Stream closed, killing child process`)
                        proc.kill()
                    })

                    proc.exited.then((code: number) => {
                        console.log(`[SSH] Child process exited with code: ${code}`)
                        stream.exit(code || 0)
                        stream.end()
                    }).catch((err: any) => {
                        console.error(`[SSH] Process error:`, err.message)
                        stream.stderr?.write?.(`Error: ${err.message}\n`)
                        stream.end()
                    })
                })

                session.on("pty", (accept, _reject, info) => {
                    console.log("[SSH] PTY requested:", info)
                    // Capture PTY dimensions
                    ptyDims = {
                        rows: info.rows || 24,
                        cols: info.cols || 80
                    }
                    console.log(`[SSH] PTY dimensions: ${ptyDims.cols}x${ptyDims.rows}`)
                    accept()
                })

                session.on("shell", (accept) => {
                    console.log("[SSH] Shell requested")
                    const stream = accept()

                    // Spawn bash with proper shell configuration and PTY dimensions
                    shellProc = require("bun").spawn(["/bin/bash", "-i"], {
                        stdin: "pipe",
                        stdout: "pipe",
                        stderr: "pipe",
                        pty: {
                            cols: ptyDims.cols,
                            rows: ptyDims.rows
                        },
                        env: process.env
                    })

                    // Forward shell output to SSH client using Web Streams API
                    const forwardOutput = async () => {
                        if (shellProc.stdout) {
                            const reader = shellProc.stdout.getReader()
                            try {
                                while (true) {
                                    const { done, value } = await reader.read()
                                    if (done) break
                                    stream.write(Buffer.from(value))
                                }
                            } catch (err) {
                                console.error(`[SSH] stdout read error:`, err)
                            }
                        }
                    }

                    const forwardErrors = async () => {
                        if (shellProc.stderr) {
                            const reader = shellProc.stderr.getReader()
                            try {
                                while (true) {
                                    const { done, value } = await reader.read()
                                    if (done) break
                                    stream.stderr?.write?.(Buffer.from(value))
                                }
                            } catch (err) {
                                console.error(`[SSH] stderr read error:`, err)
                            }
                        }
                    }

                    // Start reading outputs without blocking
                    forwardOutput().catch((err: any) => console.error(`[SSH] Output forward error:`, err))
                    forwardErrors().catch((err: any) => console.error(`[SSH] Error forward error:`, err))

                    // Forward SSH client input to shell stdin
                    stream.on("data", (data: Buffer) => {
                        if (shellProc.stdin && !shellProc.stdin.closed) {
                            shellProc.stdin.write(data)
                        }
                    })

                    stream.on("close", () => {
                        try {
                            shellProc.kill()
                        } catch (e) {
                            // Already closed
                        }
                    })

                    shellProc.exited.then((code: number) => {
                        try {
                            stream.exit(code || 0)
                            stream.end()
                        } catch (e) {
                            // Stream already closed
                        }
                    }).catch((err: any) => {
                        console.error(`[SSH] Shell process error:`, err)
                    })

                    stream.on("signal", (signal: string) => {
                        console.log(`[SSH] Received signal: ${signal}`)
                        try {
                            shellProc.kill(signal)
                        } catch (e) {
                            // Already dead
                        }
                    })

                    // Handle window resize
                    stream.on("window-change", (info: any) => {
                        console.log(`[SSH] Window resize: ${info.cols}x${info.rows}`)
                        ptyDims = {
                            rows: info.rows || 24,
                            cols: info.cols || 80
                        }
                        // Resize the PTY if the process supports it
                        if (shellProc && typeof shellProc.resize === "function") {
                            try {
                                shellProc.resize(ptyDims.cols, ptyDims.rows)
                            } catch (error) {
                                console.error(`[SSH] Failed to resize PTY:`, error)
                            }
                        }
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
        async start(port: number = 2424): Promise<void> {
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
            // Try port 2424 - capsuleer SSH port
            return new Promise((resolve) => {
                const socket = require("net").createConnection({
                    host: "127.0.0.1",
                    port: 2424,
                    timeout: 500,
                })

                socket.on("connect", () => {
                    console.log(`[SSH] Health check: connected successfully to port 2424`)
                    socket.destroy()
                    resolve({
                        status: "running",
                        port: 2424,
                        clients: activeClients.size,
                    })
                })

                socket.on("error", (err: any) => {
                    console.log(`[SSH] Health check: connection error to port 2424:`, err.message)
                    socket.destroy()
                    resolve({
                        status: "stopped",
                        port: 0,
                        clients: 0,
                    })
                })

                socket.on("timeout", () => {
                    console.log(`[SSH] Health check: connection timeout to port 2424`)
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
