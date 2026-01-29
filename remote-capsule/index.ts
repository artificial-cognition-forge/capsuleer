#!/usr/bin/env bun
/**
 * REMOTE CAPSULE SERVER
 *
 * Persistent process that:
 * - Reads JSONL protocol messages from stdin (boot, trigger, abort, shutdown)
 * - Executes operations on a Capsule instance
 * - Writes JSONL responses and stimuli to stdout
 * - Uses stderr for debug logs
 *
 * Usage:
 *   bun remote-capsule/index.ts <path-to-capsule-def>
 *
 * Example:
 *   bun remote-capsule/index.ts ./examples/tmux-capsule.ts
 */

import { CapsuleRunner } from "./capsuleRunner.js"
import { createLineReader, parseMessage, writeMessage, logDebug, logError } from "./marshalling.js"
import type {
    ProtocolMessage,
    BootMessage,
    TriggerMessage,
    AbortMessage,
    ShutdownMessage
} from "../src/transports/types.js"
import type { CapsuleDef } from "types/capsule.js"

/**
 * Main server function
 */
async function main(): Promise<void> {
    // Validate arguments
    if (process.argv.length < 3) {
        logError("Usage: bun remote-capsule/index.ts <path-to-capsule-def>")
        process.exit(1)
    }

    const capsuleDefPath = process.argv[2]
    logDebug("Starting remote capsule server", { capsuleDefPath })

    let capsuleDef: CapsuleDef<any, any>

    // Load capsule definition
    try {
        // Use dynamic import to load the capsule definition
        const module = await import(capsuleDefPath)
        capsuleDef = module.default || module.capsuleDef
        if (!capsuleDef || typeof capsuleDef !== "object") {
            throw new Error("Capsule definition must export default or capsuleDef")
        }
        logDebug("Loaded capsule definition", { name: capsuleDef.name })
    } catch (e: any) {
        logError("Failed to load capsule definition", e)
        process.exit(1)
    }

    // Create runner
    const runner = new CapsuleRunner(capsuleDef, process.stdout)

    // Set up signal handlers for graceful shutdown
    process.on("SIGTERM", async () => {
        logDebug("Received SIGTERM, shutting down gracefully")
        const response = await runner.handleShutdown({ type: "shutdown" })
        writeMessage(process.stdout, response)
        process.exit(0)
    })

    process.on("SIGINT", async () => {
        logDebug("Received SIGINT, shutting down gracefully")
        const response = await runner.handleShutdown({ type: "shutdown" })
        writeMessage(process.stdout, response)
        process.exit(0)
    })

    // Read and process JSONL messages from stdin
    try {
        const lineReader = createLineReader(process.stdin)

        for await (const line of lineReader) {
            // Skip empty lines
            if (line.trim().length === 0) {
                continue
            }

            try {
                const message = parseMessage(line)
                await routeMessage(runner, message)
            } catch (e: any) {
                logError("Failed to parse message", e)
                // Send error response if we can identify request ID
                try {
                    const msg = JSON.parse(line)
                    if (msg.id && (msg.type === "trigger" || msg.type === "abort")) {
                        writeMessage(process.stdout, {
                            id: msg.id,
                            type: "response",
                            error: `Protocol error: ${e?.message}`
                        } as any)
                    }
                } catch {
                    // Couldn't parse enough to send a response
                }
            }
        }

        // stdin closed - shutdown gracefully
        logDebug("stdin closed, shutting down")
        const response = await runner.handleShutdown({ type: "shutdown" })
        writeMessage(process.stdout, response)
    } catch (e: any) {
        logError("Server error", e)
        process.exit(1)
    }
}

/**
 * Route a protocol message to the appropriate handler
 */
async function routeMessage(runner: CapsuleRunner, message: ProtocolMessage): Promise<void> {
    switch (message.type) {
        case "boot": {
            const msg = message as BootMessage
            await runner.handleBoot(msg)
            break
        }

        case "trigger": {
            const msg = message as TriggerMessage
            await runner.handleTrigger(msg)
            break
        }

        case "abort": {
            const msg = message as AbortMessage
            runner.handleAbort(msg)
            break
        }

        case "shutdown": {
            const msg = message as ShutdownMessage
            const response = await runner.handleShutdown(msg)
            writeMessage(process.stdout, response)
            process.exit(0)
        }

        default:
            logError("Unknown message type", { type: (message as any).type })
    }
}

// Start the server
main().catch((e) => {
    logError("Fatal error", e)
    process.exit(1)
})
