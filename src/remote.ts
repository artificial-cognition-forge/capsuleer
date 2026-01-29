/**
 * REMOTE CAPSULE INSTANCE
 *
 * CapsuleInstance implementation for SSH-backed execution.
 * Communicates with a remote persistent capsule process over SSH,
 * using JSONL protocol over stdout/stdin.
 *
 * The Mind sees this as a regular CapsuleInstance - it has no visibility
 * that execution is remote.
 */

import { exec } from "node:child_process"
import { promisify } from "node:util"
import { Readable, Writable } from "node:stream"
import type {
    CapsuleDef,
    CapsuleInstance,
    CapsuleMetadata,
    ExtractCapabilityNames,
    ExtractOperationNames,
    ExtractOperationParams,
    ExtractOperationReturn,
    StimulusHandler
} from "./types/mod.js"
import type { SSHConfig, BootResponse, ShutdownResponse } from "./transports/types.js"
import { JSONLProtocolHandler } from "./transports/protocol.js"
import { serializeMessage } from "./transports/marshalling.js"

/**
 * Simple async iterable for collecting stream data
 */
class StreamAsyncIterable<T> {
    private queue: Array<T | { error: true; reason: string } | { done: true }> = []
    private waiting: Array<(value: void) => void> = []

    async* [Symbol.asyncIterator](): AsyncIterator<T> {
        while (true) {
            // If queue has items, yield them immediately
            while (this.queue.length > 0) {
                const item = this.queue.shift()!

                if ("done" in item) {
                    return // End iteration
                }

                if ("error" in item) {
                    throw new Error(item.reason)
                }

                yield item
            }

            // Queue is empty, wait for more data or end
            await new Promise((resolve) => {
                this.waiting.push(resolve)
            })

            // After waiting, loop back to check queue again
        }
    }

    pushData(data: T): void {
        this.queue.push(data)
        this.wakeup()
    }

    pushError(reason: string): void {
        this.queue.push({ error: true, reason })
        this.wakeup()
    }

    pushEnd(): void {
        this.queue.push({ done: true })
        this.wakeup()
    }

    private wakeup(): void {
        while (this.waiting.length > 0) {
            const resolve = this.waiting.shift()!
            resolve()
        }
    }
}

const execAsync = promisify(exec)

/**
 * Create a remote CapsuleInstance over SSH.
 *
 * Spawns a persistent capsule process on the remote machine and communicates
 * via JSONL protocol over SSH stdin/stdout.
 *
 * Type-safe: Full type preservation for trigger/emit.
 *
 * @param def - Capsule definition (used for type safety, not transmitted)
 * @param sshConfig - SSH connection configuration
 * @param remoteCapsueName - Name of the capsule on remote (used to spawn process)
 * @returns CapsuleInstance backed by SSH transport
 */
export function RemoteCapsuleInstance<
    TCapabilities extends readonly any[] = readonly any[],
    TStimulusMap extends Record<string, any> = Record<string, any>
>(
    def: CapsuleDef<TCapabilities, TStimulusMap>,
    sshConfig: SSHConfig,
    remoteCapsueName: string
): CapsuleInstance<CapsuleDef<TCapabilities, TStimulusMap>> {
    // Internal state
    let protocol: JSONLProtocolHandler | null = null
    let sshProcess: any = null
    let metadata: CapsuleMetadata | null = null
    let state: "created" | "booted" | "shutdown" = "created"

    /**
     * Build SSH command to start remote capsule
     */
    function buildSSHCommand(): string {
        const capsulePath = sshConfig.capsulePath
        const workDir = sshConfig.workingDir ? `cd "${sshConfig.workingDir}" && ` : ""
        const host = sshConfig.host
        const port = sshConfig.port ?? 22
        const username = sshConfig.username

        // SSH command: spawn remote capsule process
        // The remote process reads JSONL from stdin, writes JSONL to stdout
        const remoteCmd = `${workDir}${capsulePath} serve "${remoteCapsueName}"`

        // Build SSH invocation (using ssh command-line)
        // Note: In production, use ssh2 npm package for better control
        return `ssh -p ${port} ${username}@${host} '${remoteCmd}'`
    }

    /**
     * Connect to remote capsule
     */
    async function connect(): Promise<void> {
        // Spawn SSH process with remote capsule command
        const cmd = buildSSHCommand()

        return new Promise((resolve, reject) => {
            try {
                sshProcess = exec(cmd, (error, stdout, stderr) => {
                    // Process ended
                    if (error) {
                        console.error("SSH process error:", error)
                    }
                })

                // Set up protocol handler on stdout/stdin
                protocol = new JSONLProtocolHandler(sshProcess.stdout)

                // Wait for connection to be ready (short delay)
                setTimeout(() => {
                    if (protocol && protocol.isOpen()) {
                        resolve()
                    } else {
                        reject(new Error("SSH connection failed to open"))
                    }
                }, 100)
            } catch (e) {
                reject(e)
            }
        })
    }

    /**
     * Send a message over the protocol
     */
    function sendMessage(message: unknown): void {
        if (!protocol || !protocol.isOpen()) {
            throw new Error("SSH connection is not open")
        }
        const json = serializeMessage(message as any)
        protocol.writeLine(json)
    }

    /**
     * Wait for a specific response type
     */
    async function waitForResponse<T extends { type: string }>(
        responseType: string,
        timeoutMs: number = 5000
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout waiting for ${responseType}`))
            }, timeoutMs)

            // This is a bit hacky - we'd need a better response routing mechanism
            // For now, we'll use a simpler approach with protocol handler
            reject(new Error("waitForResponse not yet implemented - use registerPendingRequest instead"))
        })
    }

    return {
        describe(): CapsuleMetadata {
            if (!metadata) {
                throw new Error("Metadata not loaded - call boot() first")
            }
            return metadata
        },

        async boot(): Promise<void> {
            if (state === "booted") {
                return // Idempotent
            }
            if (state === "shutdown") {
                throw new Error("Cannot boot a shutdown capsule")
            }

            // 1. Connect to SSH
            await connect()

            // 2. Send boot message
            const bootRequestId = "boot-0"
            const bootPromise = new Promise<BootResponse>((resolve, reject) => {
                protocol!.registerPendingRequest(bootRequestId, (value) => {
                    resolve(value as BootResponse)
                }, reject)
            })

            sendMessage({
                type: "boot",
                capsuleName: remoteCapsueName
            })

            // 3. Wait for boot response
            const bootResponse = await bootPromise
            if (!bootResponse.ready) {
                throw new Error(bootResponse.error ?? "Remote boot failed")
            }

            metadata = bootResponse.metadata ?? undefined

            state = "booted"
        },

        async shutdown(): Promise<void> {
            if (state === "shutdown") {
                return // Idempotent
            }
            if (state === "created") {
                throw new Error("Cannot shutdown a capsule that was never booted")
            }

            // Send shutdown message
            const shutdownRequestId = "shutdown-0"
            const shutdownPromise = new Promise<ShutdownResponse>((resolve, reject) => {
                protocol!.registerPendingRequest(shutdownRequestId, (value) => {
                    resolve(value as ShutdownResponse)
                }, reject)
            })

            try {
                sendMessage({
                    type: "shutdown"
                })

                // Wait for shutdown response with timeout
                await Promise.race([
                    shutdownPromise,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Shutdown timeout")), 2000)
                    )
                ])
            } catch (e) {
                console.error("Shutdown error:", e)
            } finally {
                // Close SSH connection
                if (protocol) {
                    protocol.close()
                    protocol = null
                }
                if (sshProcess) {
                    sshProcess.kill()
                    sshProcess = null
                }
                state = "shutdown"
            }
        },

        async trigger<
            CapName extends ExtractCapabilityNames<CapsuleDef<TCapabilities, TStimulusMap>>,
            OpName extends ExtractOperationNames<CapsuleDef<TCapabilities, TStimulusMap>, CapName>
        >(
            capability: CapName,
            operation: OpName,
            params: ExtractOperationParams<CapsuleDef<TCapabilities, TStimulusMap>, CapName, OpName>,
            signal?: AbortSignal
        ): Promise<ExtractOperationReturn<CapsuleDef<TCapabilities, TStimulusMap>, CapName, OpName>> {
            if (state !== "booted") {
                throw new Error(`Cannot trigger operations: capsule is ${state}`)
            }

            if (!protocol || !protocol.isOpen()) {
                throw new Error("SSH connection is not open")
            }

            const requestId = `trigger-${Math.random().toString(36).slice(2, 11)}`

            // Check if this is a stream operation
            const isStreamOp = metadata?.capabilities
                .find((cap) => cap.name === capability)
                ?.operations.find((op) => op.name === operation)
                ?.kind === "stream"

            // For stream operations, create a stream async iterable
            if (isStreamOp) {
                const streamIterable = new StreamAsyncIterable<unknown>()

                protocol.registerStreamCollector(requestId, {
                    onData: (data) => streamIterable.pushData(data),
                    onEnd: (error) => {
                        if (error) {
                            streamIterable.pushError(error)
                        } else {
                            streamIterable.pushEnd()
                        }
                    }
                })

                // Register abort listener
                let abortHandler: (() => void) | null = null
                if (signal) {
                    if (signal.aborted) {
                        throw new Error(`Operation aborted: ${capability}.${operation}`)
                    }

                    abortHandler = () => {
                        // Send abort message to remote
                        try {
                            sendMessage({
                                id: requestId,
                                type: "abort",
                                reason: signal.reason ?? "user"
                            })
                        } catch (e) {
                            console.error("Failed to send abort:", e)
                        }
                    }

                    signal.addEventListener("abort", abortHandler, { once: true })
                }

                try {
                    // Send trigger request
                    sendMessage({
                        id: requestId,
                        type: "trigger",
                        capability,
                        operation,
                        params,
                        signalAborted: signal?.aborted ?? false
                    })

                    // Return the stream immediately
                    return streamIterable as any
                } finally {
                    if (abortHandler && signal) {
                        signal.removeEventListener("abort", abortHandler)
                    }
                }
            } else {
                // Normal operation: create promise for response
                const triggerPromise = new Promise<ExtractOperationReturn<CapsuleDef<TCapabilities, TStimulusMap>, CapName, OpName>>(
                    (resolve, reject) => {
                        protocol!.registerPendingRequest(requestId, resolve, reject)
                    }
                )

                // Register abort listener
                let abortHandler: (() => void) | null = null
                if (signal) {
                    if (signal.aborted) {
                        throw new Error(`Operation aborted: ${capability}.${operation}`)
                    }

                    abortHandler = () => {
                        // Send abort message to remote
                        try {
                            sendMessage({
                                id: requestId,
                                type: "abort",
                                reason: signal.reason ?? "user"
                            })
                        } catch (e) {
                            console.error("Failed to send abort:", e)
                        }
                    }

                    signal.addEventListener("abort", abortHandler, { once: true })
                }

                try {
                    // Send trigger request
                    sendMessage({
                        id: requestId,
                        type: "trigger",
                        capability,
                        operation,
                        params,
                        signalAborted: signal?.aborted ?? false
                    })

                    // Wait for response
                    return await triggerPromise
                } finally {
                    if (abortHandler && signal) {
                        signal.removeEventListener("abort", abortHandler)
                    }
                }
            }
        },

        emit(): void {
            throw new Error("Cannot emit into remote capsules - use onStimulus to receive events")
        },

        onStimulus(handler: StimulusHandler): () => void {
            if (!protocol) {
                throw new Error("SSH connection not yet established - call boot() first")
            }
            return protocol.onStimulus(handler)
        },

        ssh(): SSHConfig {
            return sshConfig
        }
    }
}
