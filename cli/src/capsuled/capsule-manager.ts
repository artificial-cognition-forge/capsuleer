import { Capsule, type CapsuleBlueprint, type CapsuleInstance } from "../capsule/defineCapsule"
import { parseCapsuleUrl } from "./utils/parseCapsuleUrl"

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
    attach(connectionString: string): Promise<void>
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

        async attach(connectionString: string): Promise<void> {
            const conn = parseCapsuleUrl(connectionString)

            const capsule = capsules.get(conn.capsuleName)
            if (!capsule) {
                console.error(`No capsule found with name: ${conn.capsuleName}`)
                return
            }

            // Ensure capsule is started
            await capsule.start()

            // Create a session for this attach
            const session = await capsule.connect(`attach:${Date.now()}`)

            // Map endpoint to runtime: "repl" or "typescript" → typescript, anything else → shell
            const runtime: 'shell' | 'typescript' = (conn.endpoint === 'repl' || conn.endpoint === 'typescript') ? 'typescript' : 'shell'

            // Spawn the process
            const spawnOpts = {
                name: conn.capsuleName,
                endpoint: conn.endpoint,
                host: conn.host,
                port: parseInt(conn.port),
                pty: true, // Enable PTY for interactive terminal (both shell and Node REPL)
            }

            const process = runtime === 'shell'
                ? await capsule.spawn.shell(session.id, spawnOpts)
                : await capsule.spawn.repl(session.id, spawnOpts)

            // Attach to the PTY
            await capsule.attach(session.id, process.id)
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