import { trace } from "../capsuled/trace"
import { createSessionManager, type CapsuleSession } from "./sessions"
import { createShellSpawner } from "./spawn/shell"
import { createReplSpawner } from "./spawn/repl"
import { createAttachHandler } from "./attach"

/**
 * The main Capsule blueprint type
 */
export type CapsuleBlueprint = {
    name: string                   // capsule name
    description?: string
    env: Record<string, string>
    boot: Promise<void>
    shutdown: Promise<void>
    scope: any
}

export type DefineCapsuleInput = {
    name: string
    description?: string

    env?: Record<string, string>
    scope?: any

    /** setup hook */
    boot?: Promise<void>


    /** shutdown hook */
    shutdown?: Promise<void>
}

/**
 * The API: define a capsule blueprint
 */
export type DefineCapsuleFn = (blueprint: CapsuleBlueprint) => CapsuleBlueprint

/** Define capsule */
export function defineCapsule(input: DefineCapsuleInput): CapsuleBlueprint {
    return {
        name: input.name,
        description: input.description,
        env: input.env || {},
        boot: input.boot || Promise.resolve(),
        shutdown: input.shutdown || Promise.resolve(),
        scope: [],
    }
}

export type CapsuleState = {
    sessionName: string
    started: boolean
}

export type CapsuleSpawnOptions = {
    name: string
    endpoint: string
    host: string
    port: number
    pty?: boolean
}

export type CapsuleAddress = {
    name: string
    endpoint: string
    host: string
    port: number
}

export type CapsuleProcess = {
    id: string
    runtime: "shell" | "typescript"
    address: CapsuleAddress
} & Bun.Subprocess


/**
 * Capsule
 * 
 * - shell process
 * - bun process
 */
export async function Capsule(blueprint: CapsuleBlueprint) {
    const state: CapsuleState = {
        sessionName: blueprint.name,
        started: false,
    }

    const sessionMgr = createSessionManager(blueprint.name)

    // Create spawn and attach handlers with sessionMgr context
    const shellSpawner = createShellSpawner(sessionMgr)
    const replSpawner = createReplSpawner(sessionMgr)
    const attachHandler = createAttachHandler(sessionMgr)

    const capsule = {
        blueprint: blueprint,

        /** Boot the capsule */
        async start() {
            const t = trace()
            if (state.started) return

            t.append({
                type: "capsule.boot",
                capsuleId: blueprint.name,
            })

            state.started = true
        },

        sessions: sessionMgr,

        /** Create a new process in the capsule */
        spawn: {
            shell: shellSpawner,
            repl: replSpawner,
        },

        attach: attachHandler,

        /**
         * Connect a client to this capsule
         *
         * Called by daemon after SSH authentication.
         * Creates and returns a new session for the authenticated client.
         *
         * Throws if capsule is not started.
         */
        async connect(clientId: string): Promise<CapsuleSession> {
            if (!state.started) {
                throw new Error("Capsule is not started")
            }

            return sessionMgr.create(clientId)
        },

        /** Shutdown the capsule*/
        async stop() {
            if (!state.started) return

            const t = trace()

            t.append({
                type: "capsule.shutdown",
                capsuleId: blueprint.name,
            })

            state.started = false
        },
    }

    return capsule
}

export type CapsuleInstance = Awaited<ReturnType<typeof Capsule>>