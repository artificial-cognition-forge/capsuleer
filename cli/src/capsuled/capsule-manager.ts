import { Capsule, type CapsuleBlueprint, type CapsuleInstance } from "../capsule/defineCapsule"

import { spawn } from "bun"
import tmux from "./tmux"

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
    list(): Promise<CapsuleInstance[]>
    get(id: string): Promise<CapsuleInstance | null>
    attach(name: string, options?: CapsuleAttachOptions): Promise<void>
}

type CapsuleAttachOptions = {
    interface?: "shell" | "typescript"
    pty?: {
        term?: string
        cols?: number
        rows?: number
    }
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

    console.log("HELLO FROM CAPSULE MANAGER CREATOR")
    // // Create (but don't start) all capsules
    // for (const config of capsuleConfigs) {
    //     continue
    //     const capsule = await Capsule(config)
    //     capsules.set(config.name, capsule)
    // }

    return {
        async start() {
            // Start all capsules
            for (const capsule of capsules.values()) {
                return
                await capsule.start()
            }
        },

        async list(): Promise<CapsuleInstance[]> {
            return Array.from(capsules.values())
        },

        async get(id: string): Promise<CapsuleInstance | null> {
            return capsules.get(id) || null
        },

        /** 
         * Capsule Attach
         * 
         * Attach to a running capsule process.
         * 
         * @returns
         * A promise that resolves when the process ends.
         * 
         */
        async attach(name: string, options?: CapsuleAttachOptions) {
            const capsule = capsules.get(name) as CapsuleInstance
            if (!capsule) {
                throw new Error(`Capsule not found: ${name}`)
            }

            // Exits automatically when the process ends
            // Config is applied at session creation time in defineCapsule.ts
            await tmux.session.attach("capsule-default")
        },
    }
}