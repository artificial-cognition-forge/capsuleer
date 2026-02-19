import type { CapsuleState } from "./defineCapsule"
import { buntime } from "./runtime/runtime"
import { trace } from "./trace"

/**
 * The main Capsule blueprint type
 */
export type CapsuleBlueprint = {
    name: string
    description?: string
    env: Record<string, string>
    boot: () => Promise<void>
    shutdown: () => Promise<void>
    scope: any
    entrypoint?: string
}

export type DefineCapsuleInput = {
    name: string
    description?: string

    env?: Record<string, string>
    scope?: any

    /** setup hook */
    boot?: () => Promise<void>

    /** shutdown hook */
    shutdown?: () => Promise<void>

    /** Absolute path to the bun environment entrypoint (required when running inside a bundler) */
    entrypoint?: string
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

    const bun = await buntime({ entrypoint: blueprint.entrypoint })

    const capsule = {
        blueprint: blueprint,

        /** Boot the capsule */
        async boot() {
            const t = trace()
            if (state.started) return

            t.append({
                type: "capsule.boot",
                capsuleId: blueprint.name,
            })

            state.started = true
        },

        command: bun.command,
        proc: bun.proc,

        /** Shutdown the capsule*/
        async shutdown() {
            if (!state.started) return

            const t = trace()
            bun.proc.kill("SIGKILL")

            t.append({
                type: "capsule.shutdown",
                capsuleId: blueprint.name,
            })

            state.started = false
        },
    }

    // boot immediately
    await capsule.boot()

    return capsule
}

export type CapsuleInstance = Awaited<ReturnType<typeof Capsule>>