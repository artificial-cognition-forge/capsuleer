/**
 * CAPSULE RUNNER
 *
 * Manages the lifecycle and execution of a Capsule on the server.
 * Handles boot, trigger, abort, and shutdown operations.
 * Forwards stimuli back to the client.
 */

import { CapsuleCore } from "src/CapsuleCore.js"
import type {
    BootMessage,
    BootResponse,
    TriggerMessage,
    TriggerResponse,
    AbortMessage,
    ShutdownMessage,
    ShutdownResponse,
    StimulusEvent,
    StreamDataMessage,
    StreamEndMessage
} from "../src/transports/types.js"
import { writeMessage, logDebug, logError } from "./marshalling.js"
import { abortAllOperations } from "./utils.js"
import type { Writable } from "node:stream"
import type { CapsuleDef, CapsuleInstance } from "types/capsule.js"
import type { Stimulus } from "types/stimulus.js"

type CapsuleState = "created" | "booted" | "shutdown"

/**
 * Runner for a single Capsule instance
 * Manages state, in-flight operations, and stimulus forwarding
 */
export class CapsuleRunner {
    private capsule: CapsuleInstance<any> | null = null
    private state: CapsuleState = "created"
    private inFlightOperations = new Map<string, AbortController>()
    private stimulusUnsubscribe: (() => void) | null = null

    constructor(
        private capsuleDef: CapsuleDef<any, any>,
        private output: Writable
    ) { }

    /**
     * Handle a boot message
     * Transitions capsule to booted state and begins stimulus forwarding
     */
    async handleBoot(msg: BootMessage): Promise<void> {
        if (this.state !== "created") {
            const response: BootResponse = {
                type: "boot",
                ready: false,
                error: `Cannot boot: capsule is ${this.state}`
            }
            writeMessage(this.output, response)
            return
        }

        try {
            // Create capsule instance
            this.capsule = CapsuleCore(this.capsuleDef)

            // Set up stimulus forwarding
            this.stimulusUnsubscribe = this.capsule.onStimulus((stimulus) => {
                this.forwardStimulus(stimulus)
            })

            // Boot the capsule
            await this.capsule.boot()

            // Respond with metadata
            const response: BootResponse = {
                type: "boot",
                ready: true,
                metadata: this.capsule.describe()
            }
            writeMessage(this.output, response)

            this.state = "booted"
            logDebug("Capsule booted successfully")
        } catch (e: any) {
            const response: BootResponse = {
                type: "boot",
                ready: false,
                error: e?.message ?? "Boot failed"
            }
            writeMessage(this.output, response)
            logError("Boot failed", e)
        }
    }

    /**
     * Handle a trigger message
     * Executes the operation and sends response (or stream data for stream operations)
     */
    async handleTrigger(msg: TriggerMessage): Promise<void> {
        if (this.state !== "booted" || !this.capsule) {
            const response: TriggerResponse = {
                id: msg.id,
                type: "response",
                error: `Cannot trigger: capsule is ${this.state}`
            }
            writeMessage(this.output, response)
            return
        }

        // If signal was already aborted on client, fail immediately
        if (msg.signalAborted) {
            const response: TriggerResponse = {
                id: msg.id,
                type: "response",
                error: `Operation aborted before execution`
            }
            writeMessage(this.output, response)
            return
        }

        // Create abort controller for this operation
        const controller = new AbortController()
        this.inFlightOperations.set(msg.id, controller)

        try {
            logDebug(`Triggering operation`, {
                id: msg.id,
                capability: msg.capability,
                operation: msg.operation
            })

            const result = await this.capsule.trigger(
                msg.capability,
                msg.operation,
                msg.params,
                controller.signal
            )

            // Check if result is an async iterable (stream operation)
            if (result && typeof result[Symbol.asyncIterator] === "function") {
                // Stream operation: send data chunks
                try {
                    for await (const chunk of result) {
                        if (controller.signal.aborted) {
                            break
                        }

                        const dataMsg: StreamDataMessage = {
                            id: msg.id,
                            type: "stream-data",
                            data: chunk
                        }
                        writeMessage(this.output, dataMsg as any)
                    }
                } catch (streamError: any) {
                    // Error during streaming
                    const endMsg: StreamEndMessage = {
                        id: msg.id,
                        type: "stream-end",
                        error: streamError?.message ?? "Stream error"
                    }
                    writeMessage(this.output, endMsg as any)
                    logDebug(`Stream error`, { id: msg.id, error: streamError?.message })
                    return
                }

                // Normal stream completion
                const endMsg: StreamEndMessage = {
                    id: msg.id,
                    type: "stream-end"
                }
                writeMessage(this.output, endMsg as any)
                logDebug(`Stream completed`, { id: msg.id })
            } else {
                // Normal operation: send result
                const response: TriggerResponse = {
                    id: msg.id,
                    type: "response",
                    result
                }
                writeMessage(this.output, response)
                logDebug(`Operation completed`, { id: msg.id })
            }
        } catch (e: any) {
            // Check if abort was the reason
            const isAborted =
                e?.message?.includes("aborted") ||
                controller.signal.aborted ||
                e?.cause === "system"

            const response: TriggerResponse = {
                id: msg.id,
                type: "response",
                error: isAborted ? `Operation aborted: ${e?.message}` : (e?.message ?? "Operation failed")
            }
            writeMessage(this.output, response)

            logDebug(`Operation error`, { id: msg.id, error: e?.message })
        } finally {
            // Remove from in-flight tracking
            this.inFlightOperations.delete(msg.id)
        }
    }

    /**
     * Handle an abort message
     * Aborts an in-flight operation
     */
    handleAbort(msg: AbortMessage): void {
        const controller = this.inFlightOperations.get(msg.id)
        if (controller) {
            controller.abort(msg.reason)
            logDebug(`Operation aborted`, { id: msg.id, reason: msg.reason })
        } else {
            logDebug(`Abort for unknown operation`, { id: msg.id })
        }
    }

    /**
     * Handle a shutdown message
     * Gracefully shuts down the capsule
     */
    async handleShutdown(msg: ShutdownMessage): Promise<ShutdownResponse> {
        if (this.state === "shutdown") {
            return { type: "shutdown", ok: true }
        }

        if (this.state !== "booted" || !this.capsule) {
            return {
                type: "shutdown",
                ok: false,
                error: `Cannot shutdown: capsule is ${this.state}`
            }
        }

        try {
            logDebug("Shutting down capsule")

            // Abort all in-flight operations
            abortAllOperations(this.inFlightOperations)

            // Shutdown capsule
            await this.capsule.shutdown()

            // Unsubscribe from stimuli
            if (this.stimulusUnsubscribe) {
                this.stimulusUnsubscribe()
                this.stimulusUnsubscribe = null
            }

            this.capsule = null
            this.state = "shutdown"

            logDebug("Capsule shutdown complete")

            return { type: "shutdown", ok: true }
        } catch (e: any) {
            logError("Shutdown failed", e)
            return {
                type: "shutdown",
                ok: false,
                error: e?.message ?? "Shutdown failed"
            }
        }
    }

    /**
     * Forward a stimulus from the capsule to the client
     */
    private forwardStimulus(stimulus: Stimulus): void {
        const event: StimulusEvent = {
            type: "stimulus",
            sense: stimulus.sense,
            data: stimulus.data,
            source: stimulus.source,
            timestamp: stimulus.timestamp ?? Date.now()
        }

        writeMessage(this.output, event as any)
    }

    /**
     * Get the current state
     */
    getState(): CapsuleState {
        return this.state
    }

    /**
     * Get count of in-flight operations
     */
    getInFlightCount(): number {
        return this.inFlightOperations.size
    }
}
