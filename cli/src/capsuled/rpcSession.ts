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

/**
 * Subscribe to process streams and emit as RPC events
 *
 * Fire-and-forget: starts async tasks that feed events through session.emitEvent()
 */
function subscribeToProcessStreams(
  process: any,
  processId: ProcessId,
  sessionId: SessionId,
  capsuleId: string,
  emitEvent: (event: SessionEvent) => void,
  trace: any
): void {
  // Verify process has required properties
  if (!process) return

  // Trace: Stream subscription started
  trace.append({
    type: 'rpc.stream.subscribe',
    capsuleId,
    sessionId,
    processId,
  })

  // Subscribe to stdout
  if (process.stdout) {
    ;(async () => {
      try {
        for await (const chunk of process.stdout) {
          // Trace: stdout data received
          trace.append({
            type: 'rpc.stream.data',
            capsuleId,
            sessionId,
            processId,
            source: 'stdout',
            bytes: chunk.length,
          })

          emitEvent({
            type: 'stdout',
            processId,
            data: Buffer.from(chunk).toString('base64'),
          })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)

        // Trace: stdout error
        trace.append({
          type: 'rpc.stream.error',
          capsuleId,
          sessionId,
          processId,
          source: 'stdout',
          error: errMsg,
        })

        emitEvent({
          type: 'error',
          processId,
          message: `stdout read error: ${errMsg}`,
        })
      }
    })()
  }

  // Subscribe to stderr
  if (process.stderr) {
    ;(async () => {
      try {
        for await (const chunk of process.stderr) {
          // Trace: stderr data received
          trace.append({
            type: 'rpc.stream.data',
            capsuleId,
            sessionId,
            processId,
            source: 'stderr',
            bytes: chunk.length,
          })

          emitEvent({
            type: 'stderr',
            processId,
            data: Buffer.from(chunk).toString('base64'),
          })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)

        // Trace: stderr error
        trace.append({
          type: 'rpc.stream.error',
          capsuleId,
          sessionId,
          processId,
          source: 'stderr',
          error: errMsg,
        })

        emitEvent({
          type: 'error',
          processId,
          message: `stderr read error: ${errMsg}`,
        })
      }
    })()
  }

  // Subscribe to exit
  if (process.exited && typeof process.exited.then === 'function') {
    process.exited
      .then(({ code, signal }: any) => {
        // Trace: process exited
        trace.append({
          type: 'rpc.stream.exit',
          capsuleId,
          sessionId,
          processId,
          code,
          signal,
        })

        emitEvent({
          type: 'exit',
          processId,
          code,
          signal,
        })
      })
      .catch((err: any) => {
        const errMsg = err instanceof Error ? err.message : String(err)

        // Trace: process exit error
        trace.append({
          type: 'rpc.stream.error',
          capsuleId,
          sessionId,
          processId,
          source: 'exit',
          error: errMsg,
        })

        emitEvent({
          type: 'error',
          processId,
          message: `process error: ${errMsg}`,
        })
      })
  }
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

    /** Close stdin on process (send EOF) */
    stdinEnd(processId: ProcessId): Promise<void>

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
        // Trace: Event emission started
        t.append({
            type: 'rpc.event.emit',
            capsuleId,
            sessionId,
            eventType: event.type,
            transportCount: attachedTransports.size,
        })

        // Fan out to all attached transports
        for (const [, transport] of attachedTransports) {
            if (transport.isConnected()) {
                try {
                    const msg: RPCMessage = {
                        type: 'event',
                        data: event,
                    }
                    const msgStr = JSON.stringify(msg)

                    // Trace: Writing event to transport
                    t.append({
                        type: 'rpc.event.write',
                        capsuleId,
                        sessionId,
                        transportId: transport.id,
                        eventType: event.type,
                        bytes: msgStr.length,
                    })

                    transport.write(msg)
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err)

                    // Trace: Transport write error
                    t.append({
                        type: 'rpc.event.write.error',
                        capsuleId,
                        sessionId,
                        transportId: transport.id,
                        error: errMsg,
                    })
                }
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
                const spawnOpts = {
                    name: capsuleName,
                    endpoint: 'default',
                    host: '127.0.0.1',
                    port: 22,
                }

                let process
                if (runtime === 'shell') {
                    process = await capsuleInstance.spawn.shell(internalSession.id, spawnOpts)
                } else if (runtime === 'bun') {
                    process = await capsuleInstance.spawn.repl(internalSession.id, spawnOpts)
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

                // Subscribe to process streams and emit as RPC events
                subscribeToProcessStreams(process, processId, sessionId, capsuleId, emitEvent, t)

                return { processId }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error)

                // Emit spawn error event
                t.append({
                    type: 'rpc.process.spawn.error',
                    capsuleId,
                    sessionId,
                    error: errorMsg,
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

                // Trace: process kill sent
                t.append({
                    type: 'rpc.process.kill',
                    capsuleId,
                    sessionId,
                    processId,
                    signal: 'SIGTERM',
                })
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error)

                // Trace: process kill error
                t.append({
                    type: 'rpc.process.kill.error',
                    capsuleId,
                    sessionId,
                    processId,
                    error: errMsg,
                })

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

            if (!proc.stdin || typeof proc.stdin.write !== 'function') {
                throw new Error(`Process has no writable stdin: ${processId}`)
            }

            try {
                // Data is sent as base64 from SDK, decode it first
                const decoded = Buffer.from(data, 'base64')
                proc.stdin.write(decoded)

                // Trace: stdin sent
                t.append({
                    type: 'rpc.process.stdin',
                    capsuleId,
                    sessionId,
                    processId,
                    bytes: decoded.length,
                })
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err)

                // Trace: stdin error
                t.append({
                    type: 'rpc.process.stdin.error',
                    capsuleId,
                    sessionId,
                    processId,
                    error: errMsg,
                })

                throw err
            }
        },

        async stdinEnd(processId: ProcessId) {
            if (isTerminated) {
                throw new Error('Session is terminated')
            }

            const proc = internalSession.procs.get(processId)
            if (!proc) {
                throw new Error(`Process not found: ${processId}`)
            }

            if (!proc.stdin || typeof proc.stdin.end !== 'function') {
                throw new Error(`Process has no closeable stdin: ${processId}`)
            }

            try {
                proc.stdin.end()

                // Trace: stdin closed
                t.append({
                    type: 'rpc.process.stdin.end',
                    capsuleId,
                    sessionId,
                    processId,
                })
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err)

                // Trace: stdin end error
                t.append({
                    type: 'rpc.process.stdin.end.error',
                    capsuleId,
                    sessionId,
                    processId,
                    error: errMsg,
                })

                throw err
            }
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
                const msg: RPCMessage = {
                    type: 'event',
                    data: {
                        type: 'error',
                        processId: randomUUIDv7() as ProcessId,
                        message: 'Session terminated',
                    },
                }
                transport.write(msg)
            }
        },
    }
}
