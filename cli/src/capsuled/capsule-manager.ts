import { Capsule, type CapsuleBlueprint, type CapsuleInstance } from "../capsule/defineCapsule"
import { trace } from "./trace"

// Stub for now, later this will stored on disk
export const capsuleRegistry: Record<string, CapsuleBlueprint> = {
    default: {
        name: "default",
        boot: Promise.resolve(),
        shutdown: Promise.resolve(),
        scope: {},
        env: {},
    },
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: CapsuleManagerInstance | null = null
let bootPromise: Promise<CapsuleManagerInstance> | null = null

export type CapsuleManagerInstance = {
    start(): Promise<void>
    list(): Promise<void>
    get(id: string): Promise<CapsuleInstance | null>
    // attach(connString: string): Promise<void> // later (pty entry point)
    stop(): Promise<void>
}

/**
 * Capsule Manager Singleton
 *
 * Returns the same instance on every call, auto-booting if needed.
 * Ensures only one CapsuleManager exists for the daemon lifetime.
 */
export async function CapsuleManager(): Promise<CapsuleManagerInstance> {
    // If already instantiated, return immediately
    if (instance !== null) {
        return instance
    }


    // If currently booting, wait for that boot to complete
    if (bootPromise !== null) {
        return bootPromise
    }

    // Start boot process
    bootPromise = createCapsuleManager()
    instance = await bootPromise
    bootPromise = null

    return instance
}

// ============================================================================
// INTERNAL: Create manager instance
// ============================================================================

async function createCapsuleManager(): Promise<CapsuleManagerInstance> {
    const capsuleConfigs = Object.values(capsuleRegistry)
    const capsules = new Map<string, CapsuleInstance>()
    const t = trace()

    for (const config of capsuleConfigs) {
        const capsule = await Capsule(config)
        capsules.set(config.name, capsule)
    }

    return {
        async start() {
            // Start all capsules
            for (const capsule of capsules.values()) {
                await capsule.start()
            }
        },

        async list() {
            const caps = Array.from(capsules.values())

            if (caps.length === 0) {
                console.log("No capsules running")
                return
            }

            console.log(`Capsules (${caps.length}):`)
            for (const capsule of caps) {
                console.log(`  - ${capsule.blueprint.name}`)
            }
        },

        async get(id: string): Promise<CapsuleInstance | null> {
            return capsules.get(id) || null
        },

        async stop() {
            const caps = Array.from(capsules.values())
            for (const capsule of caps) {
                await capsule.stop()
            }
        },
    }
}