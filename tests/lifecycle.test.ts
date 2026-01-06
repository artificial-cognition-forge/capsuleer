/**
 * Lifecycle State Transitions Tests
 *
 * Validates the capsule lifecycle state machine:
 * created → booted → shutdown (one-way only)
 *
 * RUNTIME INVARIANTS TESTED:
 * - State transitions are one-way
 * - boot() is idempotent
 * - shutdown() is idempotent
 * - trigger() only works when booted
 * - emit() only works when booted
 */

import { describe, test, expect } from "bun:test"
import { createTestCapsule, assertRejects } from "@tests/helpers"

describe("Capsule Lifecycle", () => {
    test("capsule starts in created state (trigger throws)", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            }
        })

        // Should not be able to trigger before boot
        await assertRejects(
            capsule.trigger("test", "noop", undefined),
            "capsule is created"
        )
    })

    test("boot() transitions to booted state", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            }
        })

        await capsule.boot()

        // Should now be able to trigger
        const result = await capsule.trigger("test", "noop", undefined)
        expect(result).toBe("ok")

        await capsule.shutdown()
    })

    test("boot() is idempotent (safe to call twice)", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            }
        })

        await capsule.boot()
        await capsule.boot() // Second boot should not throw

        const result = await capsule.trigger("test", "noop", undefined)
        expect(result).toBe("ok")

        await capsule.shutdown()
    })

    test("shutdown() transitions to shutdown state", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            }
        })

        await capsule.boot()
        await capsule.shutdown()

        // Should not be able to trigger after shutdown
        await assertRejects(
            capsule.trigger("test", "noop", undefined),
            "capsule is shutdown"
        )
    })

    test("shutdown() is idempotent (safe to call twice)", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            }
        })

        await capsule.boot()
        await capsule.shutdown()
        await capsule.shutdown() // Second shutdown should not throw
    })

    test("trigger() throws when capsule is created", async () => {
        const capsule = createTestCapsule({
            operations: {
                echo: async ({ params }: any) => params
            }
        })

        await assertRejects(
            capsule.trigger("test", "echo", { msg: "hello" }),
            "Cannot trigger operations: capsule is created"
        )
    })

    test("trigger() throws when capsule is shutdown", async () => {
        const capsule = createTestCapsule({
            operations: {
                echo: async ({ params }: any) => params
            }
        })

        await capsule.boot()
        await capsule.shutdown()

        await assertRejects(
            capsule.trigger("test", "echo", { msg: "hello" }),
            "Cannot trigger operations: capsule is shutdown"
        )
    })

    test("emit() no-ops when capsule is created", async () => {
        let stimulusReceived = false

        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            }
        })

        capsule.onStimulus(() => {
            stimulusReceived = true
        })

        // Try to emit before boot
        capsule.emit({ sense: "test", data: "hello" })

        // Should not have received anything
        expect(stimulusReceived).toBe(false)
    })

    test("emit() no-ops when capsule is shutdown", async () => {
        const stimuli: any[] = []

        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            }
        })

        capsule.onStimulus((s) => stimuli.push(s))

        await capsule.boot()

        // Emit while booted - should work
        capsule.emit({ sense: "test", data: "hello" })
        expect(stimuli.length).toBe(1)

        await capsule.shutdown()

        // Try to emit after shutdown - should be ignored
        capsule.emit({ sense: "test", data: "goodbye" })
        expect(stimuli.length).toBe(1) // Still only 1
    })

    test("shutdown() cannot be called before boot()", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            }
        })

        await assertRejects(
            capsule.shutdown(),
            "Cannot shutdown a capsule that was never booted"
        )
    })

    test("boot() cannot be called after shutdown()", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            }
        })

        await capsule.boot()
        await capsule.shutdown()

        await assertRejects(
            capsule.boot(),
            "Cannot boot a shutdown capsule"
        )
    })

    test("multiple operations work in booted state", async () => {
        const capsule = createTestCapsule({
            operations: {
                add: async ({ params }: any) => params.a + params.b,
                multiply: async ({ params }: any) => params.a * params.b
            }
        })

        await capsule.boot()

        const sum = await capsule.trigger("test", "add", { a: 2, b: 3 })
        expect(sum).toBe(5)

        const product = await capsule.trigger("test", "multiply", { a: 2, b: 3 })
        expect(product).toBe(6)

        await capsule.shutdown()
    })
})
