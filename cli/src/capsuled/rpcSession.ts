import { randomUUIDv7 } from "bun"
import { trace } from "./trace"
import type { CapsuleInstance } from "../capsule/defineCapsule"
import type { CapsuleSession } from "../capsule/sessions"

export type SessionId = string & { readonly __brand: 'SessionId' }
export type ProcessId = string & { readonly __brand: 'ProcessId' }
export type TransportId = string & { readonly __brand: 'TransportId' }

/** Event emitted by processes, routed through session to transports */
export type SessionEvent =
    | { type: 'stdout'; processId: ProcessId; data: Uint8Array }
    | { type: 'stderr'; processId: ProcessId; data: Uint8Array }
    | { type: 'exit'; processId: ProcessId; code: number; signal?: string }
    | { type: 'error'; processId: ProcessId; message: string }

/** Transport interface - anything that can receive events */
export interface RPCTransport {
    readonly id: TransportId
    readonly attachedAt: number

    /** Write event to transport */
    write(msg: RPCMessage): void

    /** Is this transport still connected? */
    isConnected(): boolean
}

/** RPC wire message types */
export type RPCMessage =
    | { id: number; result: any }
    | { id: number; error: { code: string; message: string } }
    | { type: 'event'; data: SessionEvent }

/** Process status snapshot */
export interface ProcessStatus {
    id: ProcessId
    runtime: 'shell' | 'bun'
    running: boolean
    code?: number
    signal?: string
}

/** RPC Session - wraps a capsule session with transport management and event routing */
export interface RPCSession {
    readonly id: SessionId
    readonly capsuleId: string
    readonly capsuleName: string
    readonly createdAt: number

    // Methods

    /** Spawn a process in this session */
    spawn(runtime: 'shell' | 'bun'): Promise<{ processId: ProcessId }>

    /** Kill a process by ID */
    kill(processId: ProcessId): Promise<void>

    /** Send stdin to process */
    stdin(processId: ProcessId, data: string): Promise<void>

    /** Get process status */
    status(processId: ProcessId): Promise<ProcessStatus>

    /** List all processes in this session */
    listProcesses(): Promise<ProcessStatus[]>

    /** Detach from a process (stop observing but keep running) */
    detachProcess(processId: ProcessId): Promise<void>

    // Transport lifecycle

    /** Attach a transport (client connection) to this session */
    attachTransport(transport: RPCTransport): TransportId

    /** Detach a transport (client disconnected) */
    detachTransport(transportId: TransportId): void

    /** Check if session is active */
    isActive(): boolean

    // Lifecycle

    /** Terminate session and all processes */
    terminate(): Promise<void>
}

/**
 * Create an RPC session that wraps a capsule session
 */
export function createRPCSession(
    capsuleInstance: CapsuleInstance,
    capsuleId: string,
    capsuleName: string
): RPCSession {
    const sessionId = randomUUIDv7() as SessionId
    const internalSession = capsuleInstance.sessions.create('rpc-client')
    const attachedTransports = new Map<TransportId, RPCTransport>()
    let isTerminated = false

    const t = trace()

    // Emit RPC session attach event
    t.append({
        type: 'rpc.session.attach',
        capsuleId,
        sessionId,
    })

    function emitEvent(event: SessionEvent) {
        // Fan out to all attached transports
        for (const [, transport] of attachedTransports) {
            if (transport.isConnected()) {
                transport.write({
                    type: 'event',
                    data: event,
                })
            }
        }
    }

    return {
        id: sessionId,
        capsuleId,
        capsuleName,
        createdAt: Date.now(),

        async spawn(runtime: 'shell' | 'bun') {
            if (isTerminated) {
                throw new Error('Session is terminated')
            }

            if (!internalSession) {
                throw new Error('Internal session not available')
            }

            try {
                // Use the appropriate spawner from the capsule
                let process
                if (runtime === 'shell') {
                    process = await capsuleInstance.spawn.shell(internalSession.id)
                } else if (runtime === 'bun') {
                    process = await capsuleInstance.spawn.repl(internalSession.id)
                } else {
                    throw new Error(`Unknown runtime: ${runtime}`)
                }

                const processId = process.id as ProcessId

                // Emit RPC spawn event
                t.append({
                    type: 'rpc.process.spawn',
                    capsuleId,
                    sessionId,
                    processId,
                    runtime,
                })

                // Subscribe to process stdout/stderr and emit as events
                // (This is a simplified version - in reality you'd subscribe to the process object)
                // For now, we'll rely on the process being tracked internally

                return { processId }
            } catch (error) {
                t.append({
                    type: 'rpc.process.error',
                    capsuleId,
                    sessionId,
                    processId: randomUUIDv7() as ProcessId,
                    error: error instanceof Error ? error.message : String(error),
                })
                throw error
            }
        },

        async kill(processId: ProcessId) {
            if (isTerminated) {
                throw new Error('Session is terminated')
            }

            const proc = internalSession.procs.get(processId)
            if (!proc) {
                throw new Error(`Process not found: ${processId}`)
            }

            try {
                proc.kill('SIGTERM')
            } catch (error) {
                // Process may already be dead
                if (error instanceof Error && !error.message.includes('already exited')) {
                    throw error
                }
            }
        },

        async stdin(processId: ProcessId, data: string) {
            if (isTerminated) {
                throw new Error('Session is terminated')
            }

            const proc = internalSession.procs.get(processId)
            if (!proc) {
                throw new Error(`Process not found: ${processId}`)
            }

            if (!proc.stdin) {
                throw new Error(`Process has no stdin: ${processId}`)
            }

            const encoded = Buffer.from(data, 'utf-8')
            proc.stdin.write(encoded)
        },

        async status(processId: ProcessId) {
            if (isTerminated) {
                throw new Error('Session is terminated')
            }

            const proc = internalSession.procs.get(processId)
            if (!proc) {
                throw new Error(`Process not found: ${processId}`)
            }

            return {
                id: processId,
                runtime: proc.runtime as 'shell' | 'bun',
                running: !proc.exited,
                code: proc.exitCode ?? undefined,
                signal: proc.signalDescription ?? undefined,
            }
        },

        async listProcesses() {
            if (isTerminated) {
                throw new Error('Session is terminated')
            }

            return Array.from(internalSession.procs.values()).map((proc) => ({
                id: proc.id as ProcessId,
                runtime: proc.runtime as 'shell' | 'bun',
                running: !proc.exited,
                code: proc.exitCode ?? undefined,
                signal: proc.signalDescription ?? undefined,
            }))
        },

        async detachProcess(processId: ProcessId) {
            if (isTerminated) {
                throw new Error('Session is terminated')
            }

            // In this model, detach just means "stop observing"
            // The process continues running. For now, this is a no-op
            // as we don't have explicit observation tracking at the process level.
            // This could be extended later if needed.
        },

        attachTransport(transport: RPCTransport) {
            if (isTerminated) {
                throw new Error('Session is terminated')
            }

            attachedTransports.set(transport.id, transport)
            return transport.id
        },

        detachTransport(transportId: TransportId) {
            attachedTransports.delete(transportId)

            // Emit detach event
            t.append({
                type: 'rpc.session.detach',
                capsuleId,
                sessionId,
                transportId,
            })
        },

        isActive() {
            return !isTerminated && internalSession.state === 'active'
        },

        async terminate() {
            if (isTerminated) return

            isTerminated = true

            // Kill the underlying capsule session
            capsuleInstance.sessions.kill(internalSession.id)

            // Notify all transports of termination
            for (const [, transport] of attachedTransports) {
                transport.write({
                    type: 'event',
                    data: {
                        type: 'error',
                        processId: randomUUIDv7() as ProcessId,
                        message: 'Session terminated',
                    },
                })
            }
        },
    }
}
