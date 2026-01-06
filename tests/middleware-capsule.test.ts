/**
 * Capsule-level Middleware Tests
 *
 * Validates that capsule middleware:
 * - Runs before operation handlers
 * - Receives invocation context (NOT execution context)
 * - Can accept, reject, or transform
 * - Rejection prevents handler execution
 * - Transform modifies params for handler
 * - Multiple middleware run in order
 * - Errors propagate correctly
 */

import { describe, test, expect } from "bun:test"
import { createTestCapsule, collectStimuli, assertRejects, trackMiddlewareInvocations } from "@tests/helpers"
import { defineMiddleware } from "@src/exports"

describe("Capsule-level Middleware", () => {
    test("capsule middleware runs before operation handler", async () => {
        const executionOrder: string[] = []

        const middleware = defineMiddleware({
            name: "tracker",
            docs: "Tracks execution order",
            async handler() {
                executionOrder.push("middleware")
                return { type: "accept" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                test: async () => {
                    executionOrder.push("handler")
                    return "ok"
                }
            },
            middleware: [middleware]
        })

        await capsule.boot()
        await capsule.trigger("test", "test", undefined)

        expect(executionOrder).toEqual(["middleware", "handler"])

        await capsule.shutdown()
    })

    test("middleware receives invocation context", async () => {
        let receivedContext: any = null

        const middleware = defineMiddleware({
            name: "inspector",
            docs: "Inspects context",
            async handler(ctx) {
                receivedContext = ctx
                return { type: "accept" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                echo: async () => "ok"
            },
            middleware: [middleware]
        })

        await capsule.boot()
        await capsule.trigger("test", "echo", { value: 42 })

        expect(receivedContext).not.toBeNull()
        expect(receivedContext.capability).toBe("test")
        expect(receivedContext.operation).toBe("echo")
        expect(receivedContext.params).toEqual({ value: 42 })
        expect(receivedContext.signal).toBeInstanceOf(AbortSignal)

        await capsule.shutdown()
    })

    test("middleware does NOT receive execution context (no emit)", async () => {
        let contextHasEmit = false

        const middleware = defineMiddleware({
            name: "checker",
            docs: "Checks for emit",
            async handler(ctx) {
                contextHasEmit = "emit" in ctx
                return { type: "accept" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                test: async () => "ok"
            },
            middleware: [middleware]
        })

        await capsule.boot()
        await capsule.trigger("test", "test", undefined)

        expect(contextHasEmit).toBe(false)

        await capsule.shutdown()
    })

    test("middleware 'accept' allows handler to run", async () => {
        let handlerRan = false

        const middleware = defineMiddleware({
            name: "acceptor",
            docs: "Always accepts",
            async handler() {
                return { type: "accept" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                test: async () => {
                    handlerRan = true
                    return "ok"
                }
            },
            middleware: [middleware]
        })

        await capsule.boot()
        await capsule.trigger("test", "test", undefined)

        expect(handlerRan).toBe(true)

        await capsule.shutdown()
    })

    test("middleware 'reject' prevents handler execution", async () => {
        let handlerRan = false

        const middleware = defineMiddleware({
            name: "rejector",
            docs: "Always rejects",
            async handler() {
                return { type: "reject", reason: "Not allowed" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                blocked: async ({ emit }: any) => {
                    handlerRan = true
                    emit({ sense: "should:not:see:this", data: "oops" })
                    return "should not return"
                }
            },
            middleware: [middleware]
        })

        const { stimuli, unsubscribe } = collectStimuli(capsule)

        await capsule.boot()

        await assertRejects(
            capsule.trigger("test", "blocked", undefined),
            "Not allowed"
        )

        expect(handlerRan).toBe(false)
        expect(stimuli.length).toBe(0) // No emissions from blocked handler

        unsubscribe()
        await capsule.shutdown()
    })

    test("middleware 'transform' modifies params before handler", async () => {
        let receivedParams: any = null

        const middleware = defineMiddleware({
            name: "transformer",
            docs: "Transforms params",
            async handler({ params }) {
                return {
                    type: "transform",
                    params: { ...params, transformed: true, value: params.value * 2 }
                }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                receiver: async ({ params }: any) => {
                    receivedParams = params
                    return params.value
                }
            },
            middleware: [middleware]
        })

        await capsule.boot()
        const result = await capsule.trigger("test", "receiver", { value: 21 })

        expect(receivedParams.transformed).toBe(true)
        expect(receivedParams.value).toBe(42)
        expect(result).toBe(42)

        await capsule.shutdown()
    })

    test("multiple middleware run in order", async () => {
        const executionOrder: string[] = []

        const mw1 = defineMiddleware({
            name: "first",
            docs: "First middleware",
            async handler() {
                executionOrder.push("mw1")
                return { type: "accept" }
            }
        })

        const mw2 = defineMiddleware({
            name: "second",
            docs: "Second middleware",
            async handler() {
                executionOrder.push("mw2")
                return { type: "accept" }
            }
        })

        const mw3 = defineMiddleware({
            name: "third",
            docs: "Third middleware",
            async handler() {
                executionOrder.push("mw3")
                return { type: "accept" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                test: async () => {
                    executionOrder.push("handler")
                    return "ok"
                }
            },
            middleware: [mw1, mw2, mw3]
        })

        await capsule.boot()
        await capsule.trigger("test", "test", undefined)

        expect(executionOrder).toEqual(["mw1", "mw2", "mw3", "handler"])

        await capsule.shutdown()
    })

    test("middleware rejection propagates error to caller", async () => {
        const middleware = defineMiddleware({
            name: "strict",
            docs: "Rejects invalid input",
            async handler({ params }: any) {
                if (!params || !params.valid) {
                    return { type: "reject", reason: "Invalid params" }
                }
                return { type: "accept" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                validateMe: async () => "ok"
            },
            middleware: [middleware]
        })

        await capsule.boot()

        await assertRejects(
            capsule.trigger("test", "validateMe", { valid: false }),
            "Invalid params"
        )

        await capsule.shutdown()
    })

    test("middleware errors propagate to caller", async () => {
        const middleware = defineMiddleware({
            name: "broken",
            docs: "Throws error",
            async handler() {
                throw new Error("Middleware crashed")
            }
        })

        const capsule = createTestCapsule({
            operations: {
                test: async () => "should not run"
            },
            middleware: [middleware]
        })

        await capsule.boot()

        await assertRejects(
            capsule.trigger("test", "test", undefined),
            "Middleware crashed"
        )

        await capsule.shutdown()
    })

    test("middleware receives abort signal", async () => {
        let receivedSignal: AbortSignal | null = null

        const middleware = defineMiddleware({
            name: "signal-checker",
            docs: "Checks signal",
            async handler({ signal }) {
                receivedSignal = signal
                return { type: "accept" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                test: async () => "ok"
            },
            middleware: [middleware]
        })

        await capsule.boot()
        await capsule.trigger("test", "test", undefined)

        expect(receivedSignal).not.toBeNull()
        expect(receivedSignal).toBeInstanceOf(AbortSignal)

        await capsule.shutdown()
    })

    test("middleware transformation chain", async () => {
        const mw1 = defineMiddleware({
            name: "add-field-1",
            docs: "Adds field",
            async handler({ params }: any) {
                return {
                    type: "transform",
                    params: { ...params, step1: true }
                }
            }
        })

        const mw2 = defineMiddleware({
            name: "add-field-2",
            docs: "Adds another field",
            async handler({ params }: any) {
                return {
                    type: "transform",
                    params: { ...params, step2: true }
                }
            }
        })

        let finalParams: any = null

        const capsule = createTestCapsule({
            operations: {
                receiver: async ({ params }: any) => {
                    finalParams = params
                    return "ok"
                }
            },
            middleware: [mw1, mw2]
        })

        await capsule.boot()
        await capsule.trigger("test", "receiver", { original: true })

        expect(finalParams.original).toBe(true)
        expect(finalParams.step1).toBe(true)
        expect(finalParams.step2).toBe(true)

        await capsule.shutdown()
    })

    test("middleware runs for all operations in capsule", async () => {
        const { middleware, invocations } = trackMiddlewareInvocations()

        const capsule = createTestCapsule({
            operations: {
                op1: async () => "result1",
                op2: async () => "result2",
                op3: async () => "result3"
            },
            middleware: [middleware]
        })

        await capsule.boot()

        await capsule.trigger("test", "op1", undefined)
        await capsule.trigger("test", "op2", undefined)
        await capsule.trigger("test", "op3", undefined)

        expect(invocations.length).toBe(3)
        expect(invocations[0].operation).toBe("op1")
        expect(invocations[1].operation).toBe("op2")
        expect(invocations[2].operation).toBe("op3")

        await capsule.shutdown()
    })

    test("first rejection stops middleware chain", async () => {
        const executionOrder: string[] = []

        const mw1 = defineMiddleware({
            name: "first",
            docs: "First - accepts",
            async handler() {
                executionOrder.push("mw1")
                return { type: "accept" }
            }
        })

        const mw2 = defineMiddleware({
            name: "second",
            docs: "Second - rejects",
            async handler() {
                executionOrder.push("mw2")
                return { type: "reject", reason: "Stopped here" }
            }
        })

        const mw3 = defineMiddleware({
            name: "third",
            docs: "Third - should not run",
            async handler() {
                executionOrder.push("mw3")
                return { type: "accept" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                test: async () => {
                    executionOrder.push("handler")
                    return "ok"
                }
            },
            middleware: [mw1, mw2, mw3]
        })

        await capsule.boot()

        await assertRejects(
            capsule.trigger("test", "test", undefined),
            "Stopped here"
        )

        // Should only have run mw1 and mw2, not mw3 or handler
        expect(executionOrder).toEqual(["mw1", "mw2"])

        await capsule.shutdown()
    })
})
