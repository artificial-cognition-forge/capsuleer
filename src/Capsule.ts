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

    // Wire up event listener to push all buntime events to trace
    const t = trace()
    bun.onEvent((event) => {
        t.append({
            type: "capsule.event",
            capsuleId: blueprint.name,
            ...event,
        })
    })

    const capsule = {
        blueprint: blueprint,

        /** Boot the capsule */
        async boot() {
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