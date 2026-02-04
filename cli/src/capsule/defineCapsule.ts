import { randomUUIDv7 } from "bun"
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
        sessionName: `capsule-default`,
        started: false,
    }

    return {
        blueprint,

        /**
         * Start capsule tmux session
         */
        async start() {
            if (state.started) return

            // Resolve locked tmux config path dynamically
            const lockedConfigPath = join(import.meta.dir, "../scripts/tmux/locked.conf")
            console.log("[Capsule.start] Config path:", lockedConfigPath)

            // Create session with interactive shell and locked tmux config
            await tmux.session.create(state.sessionName, {
                windowName: "capsule-default",
                configFile: lockedConfigPath,
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

        /**
         * ATTACH MODEL (IMPORTANT)
         *
         * This does NOT proxy IO.
         * It returns a command that the SSH layer executes.
         */
        attachCommand(window: string = "shell"): string {
            const target = `${state.sessionName}:${window}`

            // -t forces PTY
            // exec replaces SSH shell cleanly
            return `exec tmux attach -t ${target}`
        },

        /**
         * Non-interactive execution (automation only)
         */
        async exec(window: string, command: string) {
            const target = `${state.sessionName}:${window}`
            await tmux.pane.sendKeys(target, command, true)
        },

        /**
         * Snapshot output (debug / observability only)
         */
        async snapshot(window: string = "shell") {
            return tmux.pane.capture(
                `${state.sessionName}:${window}`,
                { ansi: true }
            )
        },
    }
}

export type CapsuleInstance = Awaited<ReturnType<typeof Capsule>>