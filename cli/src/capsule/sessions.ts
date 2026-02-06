import { randomUUIDv7 } from "bun"
import { trace } from "../capsuled/trace"
import type { CapsuleProcess } from "./defineCapsule"

export type CapsuleSessionState = "active" | "closing" | "closed"

export type CapsuleSession = {
    id: string
    clientId: string
    state: CapsuleSessionState
    createdAt: number
    procs: Map<string, CapsuleProcess>
}

type SessionMap = Map<string, CapsuleSession>

export type SessionManager = ReturnType<typeof createSessionManager>

/**
 * Create a session manager for a capsule
 *
 * Manages session lifecycle, process ownership, and tenancy boundaries.
 * All process spawning and attachment requires a valid, active session.
 */
export function createSessionManager(capsuleId: string) {
    const sessions: SessionMap = new Map()

    return {
        /**
         * Create a new session
         *
         * Called after client authentication.
         * Sessions are explicit - they only exist if created.
         */
        create(clientId: string): CapsuleSession {
            const session: CapsuleSession = {
                id: randomUUIDv7(),
                clientId,
                state: "active",
                createdAt: Date.now(),
                procs: new Map(),
            }

            sessions.set(session.id, session)

            const t = trace()
            t.append({
                type: "capsule.session.create",
                capsuleId,
                sessionId: session.id,
            })

            return session
        },

        /**
         * Retrieve a session by ID
         *
         * Returns null if session doesn't exist.
         */
        get(sessionId: string): CapsuleSession | null {
            return sessions.get(sessionId) ?? null
        },

        /**
         * List all sessions in this capsule
         */
        list(): CapsuleSession[] {
            return Array.from(sessions.values())
        },

        /**
         * Validate that a session exists and is active
         *
         * Throws if session is not found, closing, or closed.
         * Use this before any operation that requires a valid session.
         */
        validate(sessionId: string): CapsuleSession {
            const session = sessions.get(sessionId)

            if (!session) {
                throw new Error(`Session not found: ${sessionId}`)
            }

            if (session.state !== "active") {
                throw new Error(`Session is not active: ${sessionId} (state: ${session.state})`)
            }

            return session
        },

        /**
         * Kill a session
         *
         * - Marks session as "closing"
         * - Force-kills all owned processes
         * - Marks session as "closed"
         * - Traces event
         *
         * After this, the session cannot be used.
         */
        kill(sessionId: string): void {
            const session = sessions.get(sessionId)

            if (!session) {
                throw new Error(`Cannot kill session: not found (${sessionId})`)
            }

            session.state = "closing"

            // Force-kill all owned processes
            for (const proc of session.procs.values()) {
                try {
                    proc.kill("SIGKILL")
                } catch (e) {
                    // Process may already be dead
                }
            }

            session.procs.clear()
            session.state = "closed"

            const t = trace()
            t.append({
                type: "capsule.session.kill",
                capsuleId,
                sessionId,
            })
        },

        /**
         * Attach a process to a session
         *
         * Internal method - call from spawn() to track process ownership.
         */
        attachProcess(sessionId: string, process: CapsuleProcess): void {
            const session = this.validate(sessionId)
            session.procs.set(process.id, process)
        },

        /**
         * Detach a process from a session
         *
         * Internal method - called when a process exits.
         */
        detachProcess(sessionId: string, processId: string): void {
            const session = sessions.get(sessionId)
            if (session) {
                session.procs.delete(processId)
            }
        },
    }
}