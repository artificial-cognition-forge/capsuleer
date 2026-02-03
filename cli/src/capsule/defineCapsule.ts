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
}

export type DefineCapsuleInput = {
    name: string
    description?: string

    env?: Record<string, string>

    /** setup hook */
    boot?: Promise<void>

    capabilities: CapsuleerCapability[]

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
    }
}

/**
 * Capsule
 * 
 * - shell process
 * - bun process
 */
export async function Capsule(blueprint: CapsuleBlueprint): CapsuleInstance {
    const capsuleInstanceId = "adw"

    // spawn bun process
    const sandboxId = await sandbox.spawn(capsuleInstanceId, blueprint.capabilities)

    return {
        id: blueprint.name,
        tmuxSessionId: "capsuleer",
        blueprint: blueprint,
        pid: 0,
        clients: new Set(),
        resources: {
            cpuPercent: 0,
            memoryMB: 0,
        },
        network: {
            outbound: 0,
            inbound: 0,
        },
        status: "starting",
        lastEventIndex: 0,
        async start() {
            const config = capsuleRegistry[id]
            if (!config) {
                throw new Error(`Capsule '${id}' not found in registry`)
            }

            try {
                // Check if session already exists
                const exists = await tmux.session.has(config.tmuxSessionId)
                if (!exists) {
                    // Create a new tmux session for this capsule
                    await tmux.session.create(config.tmuxSessionId, {
                        windowName: "shell",
                    })
                    console.log(`[Capsule] Created capsule '${id}' with tmux session '${config.tmuxSessionId}'`)
                } else {
                    console.log(`[Capsule] Capsule '${id}' already running`)
                }

                return {
                    ...config,
                    status: "running",
                }
            } catch (error) {
                console.error(`[Capsule] Failed to create capsule '${id}':`, error)
                throw error
            }
        },

        async stop() {
            const config = capsuleRegistry[id]

            if (!config) {
                // throw new Error(`Capsule '${id}' not found in registry`)
            }

            try {
                const exists = await tmux.session.has(config.tmuxSessionId)
                if (exists) {
                    await tmux.session.kill(config.tmuxSessionId)
                    console.log(`[Capsule] Stopped capsule '${id}'`)
                }
            } catch (error) {
                console.error(`[Capsule] Failed to stop capsule '${id}':`, error)
            }
        },
    }
}

type CapsuleFolder = {
    "capsule.ts": CapsuleBlueprint
}

export type CapsuleInstance = {
    id: string                      // unique capsule ID
    tmuxSessionId: string
    sandboxId: string
    blueprint: CapsuleBlueprint

    /** process id */
    pid: number

    /** Network connections. */
    clients: Set<string>

    resources: {
        cpuPercent: number
        memoryMB: number
    }

    network: {
        outbound: number
        inbound: number
    }

    status: "starting" | "running" | "paused" | "stopped"
    lastEventIndex: number

    attach: (options: CapsuleAttachOptions) => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
}

type CapsuleAttachOptions = {
    mode?: CapsuleClientMode
}