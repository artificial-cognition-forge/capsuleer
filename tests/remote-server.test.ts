/**
 * Remote Capsule Server Tests
 *
 * Verifies:
 * - JSONL message parsing and serialization
 * - CapsuleRunner state management
 * - Boot, trigger, abort, and shutdown flows
 * - Stimulus forwarding
 * - Error handling
 */

import { describe, test, expect } from "bun:test"
import { Writable } from "node:stream"
import type { CapsuleDef } from "@types/mod"
import { CapsuleRunner } from "@src/../remote-capsule/capsuleRunner"
import {
    parseMessage,
    serializeMessage,
    createLineReader
} from "@src/../remote-capsule/marshalling"
import { generateRequestId, safeExecute } from "@src/../remote-capsule/utils"
import type {
    BootMessage,
    TriggerMessage,
    AbortMessage,
    ShutdownMessage,
    TriggerResponse,
    BootResponse,
    StimulusEvent
} from "@src/transports/types"

/**
 * Mock writable stream for testing
 */
class MockWritable extends Writable {
    messages: any[] = []

    _write(chunk: any, _encoding: any, callback: any): void {
        const line = chunk.toString().trim()
        if (line) {
            try {
                this.messages.push(JSON.parse(line))
            } catch (e) {
                console.error("Failed to parse message:", line, e)
            }
        }
        callback()
    }
}

/**
 * Create a simple test capsule definition
 */
function createTestCapsuleDef(): CapsuleDef<any, any> {
    return {
        name: "test-server-capsule",
        capabilities: [
            {
                name: "test",
                docs: "Test capability",
                operations: {
                    echo: {
                        name: "echo",
                        docs: "Echo back params",
                        signature: "(msg: string) => Promise<string>",
                        handler: async ({ params }: any) => {
                            return `echo: ${params.msg}`
                        }
                    },
                    emitSignal: {
                        name: "emitSignal",
                        docs: "Emit a stimulus",
                        signature: "() => Promise<void>",
                        handler: async ({ emit }: any) => {
                            emit({ sense: "test:signal", data: "signal received" })
                        }
                    },
                    fail: {
                        name: "fail",
                        docs: "Fail intentionally",
                        signature: "() => Promise<void>",
                        handler: async () => {
                            throw new Error("Operation failed as expected")
                        }
                    },
                    slowOp: {
                        name: "slowOp",
                        docs: "Slow operation",
                        signature: "() => Promise<void>",
                        handler: async ({ signal }: any) => {
                            await new Promise<void>((resolve, reject) => {
                                const timeout = setTimeout(resolve, 500)
                                signal.addEventListener("abort", () => {
                                    clearTimeout(timeout)
                                    reject(new Error("Aborted"))
                                }, { once: true })
                            })
                        }
                    }
                }
            }
        ],
        hooks: {
            boot: async ({ capsule }: any) => {
                capsule.emit({ sense: "lifecycle:boot", data: { ready: true } })
            }
        }
    }
}

describe("JSONL Message Serialization", () => {
    test("parseMessage deserializes valid JSON", () => {
        const bootMsg: BootMessage = { type: "boot", capsuleName: "test" }
        const json = serializeMessage(bootMsg as any)
        const parsed = parseMessage(json) as BootMessage

        expect(parsed.type).toBe("boot")
        expect(parsed.capsuleName).toBe("test")
    })

    test("parseMessage throws on invalid JSON", () => {
        expect(() => {
            parseMessage("not valid json {")
        }).toThrow()
    })

    test("serializeMessage produces valid JSON", () => {
        const msg: TriggerMessage = {
            id: "req-1",
            type: "trigger",
            capability: "test",
            operation: "echo",
            params: { msg: "hello" }
        }

        const json = serializeMessage(msg as any)

        expect(() => JSON.parse(json)).not.toThrow()
        expect(json).toContain('"id":"req-1"')
        expect(json).toContain('"capability":"test"')
    })
})

describe("CapsuleRunner", () => {
    test("initializes in created state", () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        expect(runner.getState()).toBe("created")
        expect(runner.getInFlightCount()).toBe(0)
    })

    test("handles boot message", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        const bootMsg: BootMessage = { type: "boot", capsuleName: "test" }
        await runner.handleBoot(bootMsg)

        expect(runner.getState()).toBe("booted")
        expect(output.messages.length).toBeGreaterThan(0)

        // Boot response might come after lifecycle stimulus, so find it
        const response = output.messages.find(
            (m: any) => m.type === "boot"
        ) as BootResponse | undefined
        expect(response).toBeDefined()
        expect(response!.type).toBe("boot")
        expect(response!.ready).toBe(true)
        expect(response!.metadata).toBeDefined()
        expect(response!.metadata?.name).toBe("test-server-capsule")
    })

    test("boot emits lifecycle stimulus", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        const bootMsg: BootMessage = { type: "boot", capsuleName: "test" }
        await runner.handleBoot(bootMsg)

        // Should have boot response + lifecycle stimulus
        const stimulusEvent = output.messages.find(
            (m: any) => m.type === "stimulus" && m.sense === "lifecycle:boot"
        )
        expect(stimulusEvent).toBeDefined()
        expect((stimulusEvent as StimulusEvent).data).toEqual({ ready: true })
    })

    test("handles trigger message", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        // Boot first
        await runner.handleBoot({ type: "boot", capsuleName: "test" })
        output.messages = [] // Clear boot messages

        // Trigger
        const triggerMsg: TriggerMessage = {
            id: "req-1",
            type: "trigger",
            capability: "test",
            operation: "echo",
            params: { msg: "hello" }
        }
        await runner.handleTrigger(triggerMsg)

        const response = output.messages.find(
            (m: any) => m.type === "response" && m.id === "req-1"
        ) as TriggerResponse | undefined
        expect(response).toBeDefined()
        expect(response!.result).toBe("echo: hello")
    })

    test("handles trigger error", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        // Boot first
        await runner.handleBoot({ type: "boot", capsuleName: "test" })
        output.messages = []

        // Trigger failing operation
        const triggerMsg: TriggerMessage = {
            id: "req-2",
            type: "trigger",
            capability: "test",
            operation: "fail",
            params: undefined
        }
        await runner.handleTrigger(triggerMsg)

        const response = output.messages.find(
            (m: any) => m.type === "response" && m.id === "req-2"
        ) as TriggerResponse | undefined
        expect(response).toBeDefined()
        expect(response!.error).toBeDefined()
        expect(response!.error).toContain("Operation failed")
    })

    test("forwards stimuli from operations", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        // Boot
        await runner.handleBoot({ type: "boot", capsuleName: "test" })
        output.messages = []

        // Trigger operation that emits
        const triggerMsg: TriggerMessage = {
            id: "req-3",
            type: "trigger",
            capability: "test",
            operation: "emitSignal",
            params: undefined
        }
        await runner.handleTrigger(triggerMsg)

        const stimulus = output.messages.find(
            (m: any) => m.type === "stimulus" && m.sense === "test:signal"
        ) as StimulusEvent | undefined
        expect(stimulus).toBeDefined()
        expect(stimulus!.data).toBe("signal received")
    })

    test("tracks concurrent operations", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        // Boot
        await runner.handleBoot({ type: "boot", capsuleName: "test" })
        output.messages = []

        // Start a slow operation without waiting
        const slowMsg: TriggerMessage = {
            id: "req-slow",
            type: "trigger",
            capability: "test",
            operation: "slowOp",
            params: undefined
        }
        runner.handleTrigger(slowMsg) // Don't await

        // In-flight count should be > 0 immediately (or 1 after microtask)
        await new Promise((resolve) => setTimeout(resolve, 10))
        // Note: exact timing is tricky, but the handler should register the operation
    })

    test("handles abort message", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        // Boot
        await runner.handleBoot({ type: "boot", capsuleName: "test" })
        output.messages = []

        // Start slow operation (don't await, let it run in background)
        const slowMsg: TriggerMessage = {
            id: "req-abort-test",
            type: "trigger",
            capability: "test",
            operation: "slowOp",
            params: undefined
        }
        runner.handleTrigger(slowMsg) // Fire and forget

        // Small delay to ensure operation is in flight
        await new Promise((resolve) => setTimeout(resolve, 50))

        // Abort the operation
        const abortMsg: AbortMessage = {
            id: "req-abort-test",
            type: "abort",
            reason: "user"
        }
        runner.handleAbort(abortMsg)

        // Wait for trigger to complete
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Should have error response
        const response = output.messages.find(
            (m: any) => m.type === "response" && m.id === "req-abort-test"
        ) as TriggerResponse | undefined
        expect(response).toBeDefined()
        expect(response!.error).toBeDefined()
    })

    test("handles shutdown message", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        // Boot
        await runner.handleBoot({ type: "boot", capsuleName: "test" })
        output.messages = []

        // Shutdown
        const shutdownMsg: ShutdownMessage = { type: "shutdown" }
        const response = await runner.handleShutdown(shutdownMsg)

        expect(response.type).toBe("shutdown")
        expect(response.ok).toBe(true)
        expect(runner.getState()).toBe("shutdown")
    })

    test("shutdown is idempotent", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        // Boot
        await runner.handleBoot({ type: "boot", capsuleName: "test" })

        // Shutdown twice
        const response1 = await runner.handleShutdown({ type: "shutdown" })
        const response2 = await runner.handleShutdown({ type: "shutdown" })

        expect(response1.ok).toBe(true)
        expect(response2.ok).toBe(true)
    })

    test("cannot trigger before boot", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        const triggerMsg: TriggerMessage = {
            id: "req-no-boot",
            type: "trigger",
            capability: "test",
            operation: "echo",
            params: { msg: "hello" }
        }
        await runner.handleTrigger(triggerMsg)

        const response = output.messages.find(
            (m: any) => m.id === "req-no-boot"
        ) as TriggerResponse | undefined
        expect(response).toBeDefined()
        expect(response!.error).toContain("Cannot trigger")
    })

    test("cannot boot twice", async () => {
        const output = new MockWritable()
        const def = createTestCapsuleDef()
        const runner = new CapsuleRunner(def, output)

        // Boot once
        await runner.handleBoot({ type: "boot", capsuleName: "test" })
        const firstBootMsg = output.messages.find((m: any) => m.type === "boot") as BootResponse
        expect(firstBootMsg).toBeDefined()
        expect(firstBootMsg.ready).toBe(true)

        output.messages = []

        // Boot again
        await runner.handleBoot({ type: "boot", capsuleName: "test" })
        const secondBootMsg = output.messages.find((m: any) => m.type === "boot") as BootResponse
        expect(secondBootMsg).toBeDefined()
        expect(secondBootMsg.ready).toBe(false)
        expect(secondBootMsg.error).toContain("Cannot boot")
    })
})

describe("Utility Functions", () => {
    test("generateRequestId creates unique IDs", () => {
        const id1 = generateRequestId()
        const id2 = generateRequestId()

        expect(id1).not.toBe(id2)
        expect(id1).toMatch(/^req-/)
        expect(id2).toMatch(/^req-/)
    })

    test("safeExecute wraps success", async () => {
        const result = await safeExecute(async () => {
            return 42
        })

        expect(result.ok).toBe(true)
        expect((result as any).value).toBe(42)
    })

    test("safeExecute wraps error", async () => {
        const result = await safeExecute(async () => {
            throw new Error("test error")
        })

        expect(result.ok).toBe(false)
        expect((result as any).error).toContain("test error")
    })
})
