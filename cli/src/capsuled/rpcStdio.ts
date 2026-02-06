import { randomUUIDv7, readline } from 'bun'
import { trace } from './trace'
import type {
    RPCSession,
    RPCTransport,
    TransportId,
    SessionId,
    ProcessId,
    RPCMessage,
} from './rpcSession'
import type { RPCSessionRegistry } from './rpcSessions'

/** RPC request message types */
type RPCRequest =
    | { id: number; method: 'attach-capsule'; params: { capsule: string } }
    | { id: number; method: 'spawn'; params: { runtime: 'shell' | 'bun' } }
    | { id: number; method: 'stdin'; params: { processId: string; data: string } }
    | { id: number; method: 'kill'; params: { processId: string } }
    | { id: number; method: 'detach'; params: { processId: string } }
    | { id: number; method: 'status'; params: { processId: string } }
    | { id: number; method: 'list-processes'; params: {} }

/**
 * RPC stdio handler
 *
 * Runs in an SSH exec channel, reading JSON-L requests and writing JSON-L responses.
 * Entry point: called by daemon.rpc.stdio()
 */
export async function handleRPCStdio(sessionRegistry: RPCSessionRegistry): Promise<void> {
    const transportId = randomUUIDv7() as TransportId
    let currentSession: RPCSession | undefined
    let currentSessionId: SessionId | undefined

    const t = trace()

    // Create transport abstraction
    const transport: RPCTransport = {
        id: transportId,
        attachedAt: Date.now(),

        write(msg) {
            // Write to stdout with newline (JSON-L format)
            process.stdout.write(JSON.stringify(msg) + '\n')
        },

        isConnected() {
            // For now, always true. Could track manually if needed.
            return true
        },
    }

    // Create line reader for stdin (JSON-L format)
    const rl = readline({
        input: process.stdin,
    })

    let isProcessing = false

    // Process each incoming line
    for await (const line of rl) {
        // Skip empty lines
        if (!line.trim()) continue

        try {
            // Parse JSON request
            let request: RPCRequest

            try {
                const parsed = JSON.parse(line)
                request = parsed
            } catch (e) {
                transport.write({
                    id: 0,
                    error: {
                        code: 'PARSE_ERROR',
                        message: 'Invalid JSON in RPC request',
                    },
                })
                continue
            }

            // Validate request has required fields
            if (typeof request.id !== 'number' || typeof request.method !== 'string') {
                transport.write({
                    id: request.id || 0,
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'Request must have id (number) and method (string)',
                    },
                })
                continue
            }

            // Route to handler
            try {
                const result = await handleRequest(
                    request,
                    currentSession,
                    currentSessionId,
                    sessionRegistry,
                    (sessionId, session) => {
                        currentSessionId = sessionId
                        currentSession = session
                    }
                )

                transport.write({
                    id: request.id,
                    result,
                })
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)

                transport.write({
                    id: request.id,
                    error: {
                        code: 'HANDLER_ERROR',
                        message,
                    },
                })
            }
        } catch (error) {
            // Fatal error in request processing
            console.error('[RPC] Unexpected error:', error)
            process.exit(1)
        }
    }

    // Stdin closed - detach transport
    if (currentSession) {
        currentSession.detachTransport(transportId)
    }

    process.exit(0)
}

/**
 * Dispatch RPC request to handler
 */
async function handleRequest(
    request: RPCRequest,
    currentSession: RPCSession | undefined,
    currentSessionId: SessionId | undefined,
    sessionRegistry: RPCSessionRegistry,
    setCurrentSession: (sessionId: SessionId, session: RPCSession) => void
): Promise<any> {
    const t = trace()

    switch (request.method) {
        case 'attach-capsule': {
            // Attach to a capsule and create/get its RPC session
            const capsuleId = request.params.capsule
            const session = await sessionRegistry.getOrCreate(capsuleId)

            // Attach transport to session
            session.attachTransport({
                id: randomUUIDv7() as TransportId,
                attachedAt: Date.now(),
                write: (msg) => process.stdout.write(JSON.stringify(msg) + '\n'),
                isConnected: () => true,
            })

            setCurrentSession(session.id, session)

            return {
                sessionId: session.id,
                capsuleId: session.capsuleId,
                createdAt: session.createdAt,
            }
        }

        case 'spawn': {
            // Spawn a process in the current session
            if (!currentSession || !currentSessionId) {
                throw new Error('No session attached. Call attach-capsule first.')
            }

            const runtime = request.params.runtime
            if (runtime !== 'shell' && runtime !== 'bun') {
                throw new Error(`Invalid runtime: ${runtime}`)
            }

            const result = await currentSession.spawn(runtime)

            return {
                processId: result.processId,
                runtime,
            }
        }

        case 'stdin': {
            // Send stdin to a process
            if (!currentSession) {
                throw new Error('No session attached.')
            }

            const processId = request.params.processId as ProcessId
            const data = request.params.data

            await currentSession.stdin(processId, data)

            return { ok: true }
        }

        case 'kill': {
            // Kill a process
            if (!currentSession) {
                throw new Error('No session attached.')
            }

            const processId = request.params.processId as ProcessId

            await currentSession.kill(processId)

            return { ok: true }
        }

        case 'detach': {
            // Detach from a process (stop observing but keep running)
            if (!currentSession) {
                throw new Error('No session attached.')
            }

            const processId = request.params.processId as ProcessId

            await currentSession.detachProcess(processId)

            return { ok: true }
        }

        case 'status': {
            // Get process status
            if (!currentSession) {
                throw new Error('No session attached.')
            }

            const processId = request.params.processId as ProcessId
            const status = await currentSession.status(processId)

            return {
                id: status.id,
                runtime: status.runtime,
                running: status.running,
                code: status.code,
                signal: status.signal,
            }
        }

        case 'list-processes': {
            // List all processes in the session
            if (!currentSession) {
                throw new Error('No session attached.')
            }

            const processes = await currentSession.listProcesses()

            return {
                processes: processes.map((p) => ({
                    id: p.id,
                    runtime: p.runtime,
                    running: p.running,
                    code: p.code,
                    signal: p.signal,
                })),
            }
        }

        default:
            throw new Error(`Unknown RPC method: ${(request as any).method}`)
    }
}
