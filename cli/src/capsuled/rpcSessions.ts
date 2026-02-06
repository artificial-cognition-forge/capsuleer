import { createRPCSession, type RPCSession, type SessionId } from './rpcSession'
import { CapsuleManager, type CapsuleManagerInstance } from './capsule-manager'
import { trace } from './trace'

/**
 * RPC Session Registry
 *
 * Manages all RPC sessions at the daemon level.
 * - One session per capsule connection
 * - Long-lived: survive transport disconnects
 * - Explicit termination required
 */
export interface RPCSessionRegistry {
    /** Set the capsule manager (called during daemon init) */
    setCapsuleManager(capsuleManager: CapsuleManagerInstance): void

    /** Get or create RPC session for a capsule */
    getOrCreate(capsuleId: string): Promise<RPCSession>

    /** Get existing RPC session by ID */
    get(sessionId: SessionId): RPCSession | undefined

    /** List all active RPC sessions */
    list(): RPCSession[]

    /** Terminate an RPC session and all its processes */
    terminate(sessionId: SessionId): Promise<void>

    /** Clean up inactive sessions (e.g., after timeout) */
    cleanup(): Promise<void>
}

/**
 * Create RPC session registry
 */
export function createRPCSessionRegistry(): RPCSessionRegistry {
    // Map of sessionId -> RPCSession
    const sessions = new Map<SessionId, RPCSession>()

    // Map of capsuleId -> sessionId (one session per capsule for now)
    // TODO: Later support multiple sessions per capsule with explicit IDs
    const capsuleToSession = new Map<string, SessionId>()

    let capsuleManager: CapsuleManagerInstance | null = null

    return {
        setCapsuleManager(mgr) {
            capsuleManager = mgr
        },

        async getOrCreate(capsuleId) {
            const t = trace()

            // Lazy-initialize capsule manager if not already set
            if (!capsuleManager) {
                capsuleManager = await CapsuleManager()
            }
            // Check if we already have an active session for this capsule
            const existingSessionId = capsuleToSession.get(capsuleId)
            if (existingSessionId) {
                const existing = sessions.get(existingSessionId)
                if (existing && existing.isActive()) {
                    return existing
                }
                // Session is dead, clean it up
                sessions.delete(existingSessionId)
                capsuleToSession.delete(capsuleId)
            }

            // Create new RPC session
            const capsule = await capsuleManager.get(capsuleId)
            if (!capsule) {
                // Emit error event
                t.append({
                    type: 'rpc.session.attach.error',
                    capsuleId,
                    error: `Capsule not found: ${capsuleId}`,
                })
                throw new Error(`Capsule not found: ${capsuleId}`)
            }

            const rpcSession = createRPCSession(capsule, capsuleId, capsule.blueprint.name)
            sessions.set(rpcSession.id, rpcSession)
            capsuleToSession.set(capsuleId, rpcSession.id)

            return rpcSession
        },

        get(sessionId) {
            return sessions.get(sessionId)
        },

        list() {
            return Array.from(sessions.values()).filter((s) => s.isActive())
        },

        async terminate(sessionId) {
            const session = sessions.get(sessionId)
            if (!session) {
                return
            }

            await session.terminate()
            sessions.delete(sessionId)

            // Remove from capsule mapping
            for (const [capsuleId, sid] of capsuleToSession.entries()) {
                if (sid === sessionId) {
                    capsuleToSession.delete(capsuleId)
                    break
                }
            }
        },

        async cleanup() {
            const now = Date.now()
            const sessionTimeout = 60 * 60 * 1000 // 1 hour

            const idsToDelete: SessionId[] = []

            for (const [id, session] of sessions) {
                if (!session.isActive() || now - session.createdAt > sessionTimeout) {
                    idsToDelete.push(id)
                }
            }

            for (const id of idsToDelete) {
                await this.terminate(id)
            }
        },
    }
}
