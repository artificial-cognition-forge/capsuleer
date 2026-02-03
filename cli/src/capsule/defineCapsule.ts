import { randomUUIDv7 } from "bun"
import tmux from "../capsuled/tmux"
import { storage } from "../storage/storage"
import { sandbox } from "./sandbox"

type CapsuleClientMode = "shell" | "bun"

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

type CapsuleInstanceState = {
    capsuleId: string
    name: string

    tmux: {
        sessionId: string
    },

    env: Record<string, string>,
    scope: any,
}

/**
 * Capsule
 * 
 * - shell process
 * - bun process
 */
export async function Capsule(blueprint: CapsuleBlueprint) {
    const state: CapsuleInstanceState = {
        name: blueprint.name,
        capsuleId: randomUUIDv7(),

        tmux: {
            sessionId: randomUUIDv7(),
        },

        env: blueprint.env,
        scope: blueprint.scope,
    }

    return {
        blueprint: blueprint,
        env: state.env,

        async start() {
            // Create tmux session with name: capsule-{name}
            const sessionName = `capsule-${state.name}`
            await tmux.session.create(sessionName, {
                windowName: "shell",
            })
        },

        async stop() {
            await tmux.session.kill(state.tmux.sessionId)
        },

        async attach() {
            // TODO: Implement attach
            // maybe we just need to return the attach details for the manager.
        },

        ts: {
            /** Execute a ts command */
            async exec() { },
        },
    }
}

type CapsuleFolder = {
    "capsule.ts": CapsuleBlueprint
}

export type CapsuleInstance = Awaited<ReturnType<typeof Capsule>>

type CapsuleAttachOptions = {
    mode?: CapsuleClientMode
}