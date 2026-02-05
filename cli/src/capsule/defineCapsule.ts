import { randomUUIDv7, spawn } from "bun"
import { join } from "path"
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

type CapsuleState = {
    sessionName: string
    started: boolean
}

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

    return {
        blueprint,

        /**
         * Start capsule tmux session
         */
        async start() {
            if (state.started) return

            // Clean up existing session if it exists
            try {
                await tmux.session.kill(state.sessionName)
            } catch {
                // Session doesn't exist yet, that's fine
            }

            // Create session with interactive shell and locked tmux config
            await tmux.session.create(state.sessionName, { windowName: 'main' })

            await tmux.window.create(state.sessionName, `${blueprint.name}`, {
                index: 1,
                tmux: "locked"
            })
            await tmux.window.create(state.sessionName, `${blueprint.name}/repl`, {
                command: [],
                index: 2,
                tmux: "bun"
            })
            state.started = true
        },

        /**
         * Stop capsule
         */
        async stop() {
            if (!state.started) return
            await tmux.session.kill(state.sessionName)
            state.started = false
        },
    }
}

export type CapsuleInstance = Awaited<ReturnType<typeof Capsule>>