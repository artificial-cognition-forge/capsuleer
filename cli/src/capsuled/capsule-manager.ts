import type { CapsuleInstance } from "types/capsule"
import { connectToCapsule } from "../ingress/ssh/client"
import tmux from "./tmux"
import { getTrace } from "./traceContext"

/**
 * Capsule Manager
 *
 * Manages capsules and their lifecycle.
 *
 * **role**
 * - Mediate capsule requests
 * - route network requests to correct capsule
 * - manage capsule lifecycle
 */
export type Capsule = {
    id: string
    name: string
    tmuxSessionId: string
    status: "running" | "stopped"
}

type CapsuleConfig = {
    id: string
    name: string
    tmuxSessionId: string
}

export const capsuleRegistry: Record<string, CapsuleConfig> = {
    default: {
        id: "default",
        name: "default",
        tmuxSessionId: "capsule-default",
    },
}

/** 
 * Capsule Manager
 * 
 * Manages capsule instances for the lifetime
 * of the daemon.
 */
export async function CapsuleManager() {
    const capsules = new Map<string, CapsuleInstance>()

    // load capsule blueprints
    // boot capsules

    return {
        /** Boot all capsules. */
        async start() {
            // for (capsule of capsules) {

            // }
        },

        /** List all capsules */
        async list(): Promise<Capsule[]> {
            const sessions = await tmux.session.list()

            return Object.values(capsuleRegistry).map((config) => ({
                ...config,
                status: sessions.some((s) => s.name === config.tmuxSessionId) ? "running" : "stopped",
            }))
        },

        /** Get a specific capsule by id */
        async get(id: string): Promise<Capsule | null> {
            const config = capsuleRegistry[id]
            if (!config) return null

            const sessions = await tmux.session.list()
            return {
                ...config,
                status: sessions.some((s) => s.name === config.tmuxSessionId) ? "running" : "stopped",
            }
        },

        /**
         * Connect to a capsule via SSH
         *
         * Establishes an SSH connection to a capsule and attaches to its tmux session.
         * Uses key-based authentication.
         *
         * @param capsuleId - The ID of the capsule to connect to (default: "default")
         * @param options - Connection options (privateKeyPath, username, port)
         */
        async connect(
            capsuleId: string = "default",
            options?: {
                privateKeyPath?: string
                username?: string
                port?: number
            }
        ) {
            try {
                console.log(`[CLI] Connecting to capsule '${capsuleId}'...`)
                getTrace().push({
                    type: "capsule.spawned",
                    capsuleId,
                    command: "connect",
                })
                await connectToCapsule(capsuleId, options)
            } catch (error) {
                console.error(`[CLI] Failed to connect to capsule '${capsuleId}':`, error)
                getTrace().push({
                    type: "capsule.exited",
                    capsuleId,
                    code: 1,
                })
                throw error
            }
        },
    }
}