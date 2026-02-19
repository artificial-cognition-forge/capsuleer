import { trace } from "cli/src/capsuled/trace"
import type { CapsuleState } from "./defineCapsule"
import { buntime } from "./runtime/runtime"

/**
 * The main Capsule blueprint type
 */
export type CapsuleBlueprint = {
    name: string                   // capsule name
    description?: string
    env: Record<string, string>
    boot: () => Promise<void>
    shutdown: () => Promise<void>
    scope: any
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

    const bun = await buntime()

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