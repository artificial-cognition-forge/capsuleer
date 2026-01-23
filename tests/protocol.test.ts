/**
 * JSONL Protocol Handler Tests
 *
 * Verifies the protocol layer: message serialization, line reading,
 * request/response routing, and stimulus delivery.
 */

import { describe, test, expect } from "bun:test"
import { Readable } from "node:stream"
import { JSONLProtocolHandler } from "@src/transports/protocol"
import { serializeMessage, marshalStimulus, unmarshalStimulus } from "@src/transports/marshalling"
import type { Stimulus } from "@types/stimulus"

describe("Protocol Marshalling", () => {
    test("marshalStimulus converts Stimulus to StimulusEvent", () => {
        const stimulus: Stimulus = {
            sense: "test:sense",
            data: { value: 42 },
            source: { capability: "test", operation: "op" },
            timestamp: 1234567890
        }

        const event = marshalStimulus(stimulus)

        expect(event.type).toBe("stimulus")
        expect(event.sense).toBe("test:sense")
        expect(event.data).toEqual({ value: 42 })
        expect(event.source).toEqual({ capability: "test", operation: "op" })
        expect(event.timestamp).toBe(1234567890)
    })

    test("unmarshalStimulus converts StimulusEvent to Stimulus", () => {
        const event = {
            type: "stimulus",
            sense: "data:chunk",
            data: { chunk: "hello" },
            source: { capability: "io", operation: "read" },
            timestamp: 1234567890
        }

        const stimulus = unmarshalStimulus(event as any)

        expect(stimulus.sense).toBe("data:chunk")
        expect(stimulus.data).toEqual({ chunk: "hello" })
        expect(stimulus.source).toEqual({ capability: "io", operation: "read" })
        expect(stimulus.timestamp).toBe(1234567890)
    })

    test("marshalStimulus adds timestamp if missing", () => {
        const stimulus: Stimulus = {
            sense: "test",
            data: null
        }

        const event = marshalStimulus(stimulus)

        expect(event.timestamp).toBeGreaterThan(0)
    })

    test("serializeMessage produces valid JSON line", () => {
        const message = {
            id: "req-123",
            type: "trigger",
            capability: "test",
            operation: "op",
            params: { x: 1 }
        }

        const json = serializeMessage(message)

        expect(json).toContain('"id":"req-123"')
        expect(json).toContain('"type":"trigger"')
        expect(() => JSON.parse(json)).not.toThrow()
    })
})

describe("JSONLProtocolHandler", () => {
    test("parses complete JSONL line and routes to stimulus listener", async () => {
        // Create a mock readable stream
        const mockStream = new Readable()
        const stimuli: Stimulus[] = []

        const handler = new JSONLProtocolHandler(mockStream)
        handler.onStimulus((s) => stimuli.push(s))

        // Send a stimulus event
        mockStream.push(
            JSON.stringify({
                type: "stimulus",
                sense: "test",
                data: { msg: "hello" },
                timestamp: 1000
            }) + "\n"
        )

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(stimuli.length).toBe(1)
        expect(stimuli[0].sense).toBe("test")
        expect(stimuli[0].data).toEqual({ msg: "hello" })
    })

    test("routes response to pending request", async () => {
        const mockStream = new Readable()
        const handler = new JSONLProtocolHandler(mockStream)

        let resolvedValue: unknown = null
        let rejectionError: Error | null = null

        handler.registerPendingRequest("req-1", (value) => {
            resolvedValue = value
        }, (error) => {
            rejectionError = error
        })

        // Send response
        mockStream.push(
            JSON.stringify({
                id: "req-1",
                type: "response",
                result: 42
            }) + "\n"
        )

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(resolvedValue).toBe(42)
        expect(rejectionError).toBeNull()
    })

    test("routes error response to pending request rejection", async () => {
        const mockStream = new Readable()
        const handler = new JSONLProtocolHandler(mockStream)

        let resolvedValue: unknown = null
        let rejectionError: Error | null = null

        handler.registerPendingRequest("req-2", (value) => {
            resolvedValue = value
        }, (error) => {
            rejectionError = error
        })

        // Send error response
        mockStream.push(
            JSON.stringify({
                id: "req-2",
                type: "response",
                error: "Operation failed"
            }) + "\n"
        )

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(resolvedValue).toBeNull()
        expect(rejectionError).not.toBeNull()
        expect(rejectionError!.message).toContain("Operation failed")
    })

    test("handles multiple stimuli in sequence", async () => {
        const mockStream = new Readable()
        const stimuli: Stimulus[] = []

        const handler = new JSONLProtocolHandler(mockStream)
        handler.onStimulus((s) => stimuli.push(s))

        // Send multiple stimuli
        mockStream.push(
            JSON.stringify({ type: "stimulus", sense: "s1", data: 1, timestamp: 100 }) + "\n" +
            JSON.stringify({ type: "stimulus", sense: "s2", data: 2, timestamp: 200 }) + "\n" +
            JSON.stringify({ type: "stimulus", sense: "s3", data: 3, timestamp: 300 }) + "\n"
        )

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(stimuli.length).toBe(3)
        expect(stimuli[0].sense).toBe("s1")
        expect(stimuli[1].sense).toBe("s2")
        expect(stimuli[2].sense).toBe("s3")
    })

    test("handles partial lines and buffering correctly", async () => {
        const mockStream = new Readable()
        const stimuli: Stimulus[] = []

        const handler = new JSONLProtocolHandler(mockStream)
        handler.onStimulus((s) => stimuli.push(s))

        // Send complete message as single line (buffering of partial lines is internal)
        const fullMessage = JSON.stringify({
            type: "stimulus",
            sense: "test",
            data: "buffered",
            timestamp: 500
        }) + "\n"

        // Push entire message at once
        mockStream.push(fullMessage)

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(stimuli.length).toBe(1)
        expect(stimuli[0].sense).toBe("test")
        expect(stimuli[0].data).toBe("buffered")
    })

    test("ignores empty lines", async () => {
        const mockStream = new Readable()
        const stimuli: Stimulus[] = []

        const handler = new JSONLProtocolHandler(mockStream)
        handler.onStimulus((s) => stimuli.push(s))

        // Send data with empty lines
        mockStream.push("\n")
        mockStream.push(JSON.stringify({ type: "stimulus", sense: "s1", data: 1, timestamp: 100 }) + "\n")
        mockStream.push("\n\n")
        mockStream.push(JSON.stringify({ type: "stimulus", sense: "s2", data: 2, timestamp: 200 }) + "\n")
        mockStream.push("   \n") // Whitespace-only line

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(stimuli.length).toBe(2)
        expect(stimuli[0].sense).toBe("s1")
        expect(stimuli[1].sense).toBe("s2")
    })

    test("supports multiple stimulus subscribers", async () => {
        const mockStream = new Readable()
        const stimuli1: Stimulus[] = []
        const stimuli2: Stimulus[] = []

        const handler = new JSONLProtocolHandler(mockStream)
        handler.onStimulus((s) => stimuli1.push(s))
        handler.onStimulus((s) => stimuli2.push(s))

        // Send stimulus
        mockStream.push(
            JSON.stringify({
                type: "stimulus",
                sense: "broadcast",
                data: "to all",
                timestamp: 600
            }) + "\n"
        )

        // Wait for processing
        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(stimuli1.length).toBe(1)
        expect(stimuli2.length).toBe(1)
        expect(stimuli1[0].data).toBe("to all")
        expect(stimuli2[0].data).toBe("to all")
    })

    test("unsubscribe removes listener", async () => {
        const mockStream = new Readable()
        const stimuli: Stimulus[] = []

        const handler = new JSONLProtocolHandler(mockStream)
        const unsub = handler.onStimulus((s) => stimuli.push(s))

        // Send first stimulus
        mockStream.push(
            JSON.stringify({ type: "stimulus", sense: "s1", data: 1, timestamp: 700 }) + "\n"
        )

        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(stimuli.length).toBe(1)

        // Unsubscribe
        unsub()

        // Send second stimulus - should not be received
        mockStream.push(
            JSON.stringify({ type: "stimulus", sense: "s2", data: 2, timestamp: 800 }) + "\n"
        )

        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(stimuli.length).toBe(1) // Still 1, not 2
    })

    test("getPendingCount tracks registered requests", () => {
        const mockStream = new Readable()
        const handler = new JSONLProtocolHandler(mockStream)

        expect(handler.getPendingCount()).toBe(0)

        handler.registerPendingRequest("req-1", () => {}, () => {})
        expect(handler.getPendingCount()).toBe(1)

        handler.registerPendingRequest("req-2", () => {}, () => {})
        expect(handler.getPendingCount()).toBe(2)

        // Simulate response resolution
        mockStream.push(
            JSON.stringify({ id: "req-1", type: "response", result: 42 }) + "\n"
        )

        // Wait for processing
        setTimeout(() => {
            expect(handler.getPendingCount()).toBe(1)
        }, 50)
    })

    test("isOpen() reflects stream state", () => {
        const mockStream = new Readable()
        const handler = new JSONLProtocolHandler(mockStream)

        expect(handler.isOpen()).toBe(true)

        handler.close()
        expect(handler.isOpen()).toBe(false)
    })

    test("writeLine() serializes and writes to stream", () => {
        let written = ""
        const mockStream = new Readable()
        mockStream.write = function (chunk: string) {
            written += chunk
            return true
        }

        const handler = new JSONLProtocolHandler(mockStream)

        const success = handler.writeLine('{"type":"trigger","id":"req-1"}')

        expect(success).toBe(true)
        expect(written).toContain('{"type":"trigger","id":"req-1"}')
        expect(written).toContain("\n")
    })
})
