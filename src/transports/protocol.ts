/**
 * PROTOCOL HANDLER
 *
 * JSONL protocol implementation:
 * - Line-based reader for parsing incoming events
 * - Event router for matching responses to pending requests
 * - Stimulus listener management
 */

import type { StreamEvent, TriggerResponse } from "./types.js"
import { deserializeMessage, unmarshalStimulus } from "./marshalling.js"
import type { StimulusHandler } from "types/stimulus.js"

/**
 * Handles pending trigger request resolution
 */
type PendingRequest = {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

/**
 * Handles stream data collection
 */
type StreamCollector = {
    onData: (data: unknown) => void
    onEnd: (error?: string) => void
}

/**
 * JSONL Protocol Handler
 * Manages:
 * - Reading JSONL events from a readable stream
 * - Routing responses to pending trigger requests
 * - Delivering stimuli to subscribed handlers
 */
export class JSONLProtocolHandler {
    private lineBuffer = ""
    private stimulusListeners = new Set<StimulusHandler>()
    private pendingRequests = new Map<string, PendingRequest>()
    private streamCollectors = new Map<string, StreamCollector>()
    private isReadingClosed = false

    constructor(private stream: ReadableStream) {
        // Set up stream event listeners
        stream.on("data", (chunk: Buffer) => {
            this.handleData(chunk)
        })

        stream.on("end", () => {
            this.isReadingClosed = true
            // Reject any pending requests
            for (const [_id, pending] of this.pendingRequests) {
                pending.reject(new Error("SSH stream ended unexpectedly"))
            }
            this.pendingRequests.clear()
            // End any active streams
            for (const [_id, collector] of this.streamCollectors) {
                collector.onEnd("SSH stream ended unexpectedly")
            }
            this.streamCollectors.clear()
        })

        stream.on("error", (error: Error) => {
            this.isReadingClosed = true
            // Reject any pending requests
            for (const [_id, pending] of this.pendingRequests) {
                pending.reject(error)
            }
            this.pendingRequests.clear()
            // End any active streams
            for (const [_id, collector] of this.streamCollectors) {
                collector.onEnd(error.message)
            }
            this.streamCollectors.clear()
        })
    }

    /**
     * Handle incoming data from stream
     * Buffers until complete lines, then parses as JSON
     */
    private handleData(chunk: Buffer): void {
        this.lineBuffer += chunk.toString()

        // Process complete lines (terminated by \n)
        const lines = this.lineBuffer.split("\n")
        this.lineBuffer = lines.pop() || "" // Keep incomplete line in buffer

        for (const line of lines) {
            if (line.trim().length === 0) {
                // Skip empty lines
                continue
            }

            try {
                this.handleLine(line)
            } catch (e) {
                console.error("Protocol error:", e, "Line:", line)
                // Continue processing other lines
            }
        }
    }

    /**
     * Handle a complete JSONL line
     */
    private handleLine(line: string): void {
        const event = deserializeMessage(line) as StreamEvent

        if (event.type === "stimulus") {
            // Deliver to stimulus listeners
            const stimulus = unmarshalStimulus(event)
            for (const listener of this.stimulusListeners) {
                listener(stimulus)
            }
        } else if (event.type === "stream-data") {
            // Route to stream collector
            const collector = this.streamCollectors.get(event.id)
            if (!collector) {
                console.warn(`Stream data for unknown request: ${event.id}`)
                return
            }
            collector.onData(event.data)
        } else if (event.type === "stream-end") {
            // End stream
            const collector = this.streamCollectors.get(event.id)
            if (!collector) {
                console.warn(`Stream end for unknown request: ${event.id}`)
                return
            }
            collector.onEnd(event.error)
            this.streamCollectors.delete(event.id)
        } else if (event.type === "response") {
            // Route to pending request
            const pending = this.pendingRequests.get(event.id)
            if (!pending) {
                console.warn(`Response for unknown request: ${event.id}`)
                return
            }

            if (event.error) {
                pending.reject(new Error(event.error))
            } else {
                pending.resolve(event.result)
            }

            this.pendingRequests.delete(event.id)
        }
    }

    /**
     * Register a pending trigger request
     * Called before sending trigger message
     */
    public registerPendingRequest(
        requestId: string,
        resolve: (value: unknown) => void,
        reject: (error: Error) => void
    ): void {
        this.pendingRequests.set(requestId, { resolve, reject })
    }

    /**
     * Register a stream collector for a stream operation
     * Called before sending a stream trigger message
     */
    public registerStreamCollector(
        requestId: string,
        collector: StreamCollector
    ): void {
        this.streamCollectors.set(requestId, collector)
    }

    /**
     * Subscribe to stimulus events
     * Returns unsubscribe function
     */
    public onStimulus(handler: StimulusHandler): () => void {
        this.stimulusListeners.add(handler)
        return () => {
            this.stimulusListeners.delete(handler)
        }
    }

    /**
     * Write a line to the stream (for outgoing messages)
     * Returns false if stream is closed or backpressure
     */
    public writeLine(json: string): boolean {
        if (this.isReadingClosed) {
            throw new Error("Protocol stream is closed")
        }
        return this.stream.write(json + "\n")
    }

    /**
     * Check if stream is still open
     */
    public isOpen(): boolean {
        return !this.isReadingClosed
    }

    /**
     * Gracefully close the stream
     */
    public close(): void {
        this.stream.destroy()
        this.isReadingClosed = true
    }

    /**
     * Get count of pending requests (for debugging)
     */
    public getPendingCount(): number {
        return this.pendingRequests.size
    }
}
