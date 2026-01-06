/**
 * Operation-level Middleware Tests
 *
 * Validates that operation middleware:
 * - Runs after capsule middleware
 * - Can reject specific operations
 * - Can transform params for specific operations
 * - Stacks with capsule middleware correctly
 */

import { describe, test, expect } from "bun:test"
import { Capsule, defineCapability, defineOperation, defineMiddleware } from "../src/exports"
import { collectStimuli, assertRejects } from "./helpers"

describe("Operation-level Middleware", () => {
    test("operation middleware runs after capsule middleware", async () => {
        const executionOrder: string[] = []

        const capsuleMw = defineMiddleware({
            name: "capsule-mw",
            docs: "Capsule-level middleware",
            async handler() {
                executionOrder.push("capsule-mw")
                return { type: "accept" }
            }
        })

        const opMw = defineMiddleware({
            name: "op-mw",
            docs: "Operation-level middleware",
            async handler() {
                executionOrder.push("op-mw")
                return { type: "accept" }
            }
        })

        const capability = defineCapability({
            name: "test",
            docs: "Test capability",
            operations: {
                withMw: defineOperation({
                    name: "withMw",
                    docs: "Has operation middleware",
                    signature: "function withMw(): Promise<string>",
                    middleware: [opMw],
                    async handler() {
                        executionOrder.push("handler")
                        return "ok"
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const,
            middleware: [capsuleMw]
        })

        await capsule.boot()
        await capsule.trigger("test", "withMw", undefined)

        expect(executionOrder).toEqual(["capsule-mw", "op-mw", "handler"])

        await capsule.shutdown()
    })

    test("operation middleware can reject specific operations", async () => {
        let handlerRan = false

        const opMw = defineMiddleware({
            name: "rejector",
            docs: "Rejects this operation",
            async handler() {
                return { type: "reject", reason: "Operation not allowed" }
            }
        })

        const capability = defineCapability({
            name: "test",
            docs: "Test capability",
            operations: {
                blocked: defineOperation({
                    name: "blocked",
                    docs: "This operation is blocked",
                    signature: "function blocked(): Promise<void>",
                    middleware: [opMw],
                    async handler() {
                        handlerRan = true
                    }
                }),
                allowed: defineOperation({
                    name: "allowed",
                    docs: "This operation is allowed",
                    signature: "function allowed(): Promise<void>",
                    async handler() {
                        handlerRan = true
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()

        // Blocked operation should fail
        await assertRejects(
            capsule.trigger("test", "blocked", undefined),
            "Operation not allowed"
        )
        expect(handlerRan).toBe(false)

        // Allowed operation should succeed
        handlerRan = false
        await capsule.trigger("test", "allowed", undefined)
        expect(handlerRan).toBe(true)

        await capsule.shutdown()
    })

    test("operation middleware can transform params", async () => {
        let receivedParams: any = null

        const opMw = defineMiddleware({
            name: "transformer",
            docs: "Transforms params",
            async handler({ params }: any) {
                return {
                    type: "transform",
                    params: { ...params, operationLevel: true }
                }
            }
        })

        const capability = defineCapability({
            name: "test",
            docs: "Test capability",
            operations: {
                receiver: defineOperation({
                    name: "receiver",
                    docs: "Receives transformed params",
                    signature: "function receiver(params: any): Promise<any>",
                    middleware: [opMw],
                    async handler({ params }: any) {
                        receivedParams = params
                        return params
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()
        await capsule.trigger("test", "receiver", { original: true })

        expect(receivedParams.original).toBe(true)
        expect(receivedParams.operationLevel).toBe(true)

        await capsule.shutdown()
    })

    test("capsule and operation middleware both transform params", async () => {
        let finalParams: any = null

        const capsuleMw = defineMiddleware({
            name: "capsule-transformer",
            docs: "Capsule-level transformation",
            async handler({ params }: any) {
                return {
                    type: "transform",
                    params: { ...params, capsuleLevel: true }
                }
            }
        })

        const opMw = defineMiddleware({
            name: "op-transformer",
            docs: "Operation-level transformation",
            async handler({ params }: any) {
                return {
                    type: "transform",
                    params: { ...params, operationLevel: true }
                }
            }
        })

        const capability = defineCapability({
            name: "test",
            docs: "Test capability",
            operations: {
                receiver: defineOperation({
                    name: "receiver",
                    docs: "Receives doubly transformed params",
                    signature: "function receiver(params: any): Promise<any>",
                    middleware: [opMw],
                    async handler({ params }: any) {
                        finalParams = params
                        return params
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const,
            middleware: [capsuleMw]
        })

        await capsule.boot()
        await capsule.trigger("test", "receiver", { original: true })

        expect(finalParams.original).toBe(true)
        expect(finalParams.capsuleLevel).toBe(true)
        expect(finalParams.operationLevel).toBe(true)

        await capsule.shutdown()
    })

    test("operation middleware rejection stops capsule middleware from being bypassed", async () => {
        const executionOrder: string[] = []

        const capsuleMw = defineMiddleware({
            name: "capsule-check",
            docs: "Capsule validation",
            async handler() {
                executionOrder.push("capsule-mw")
                return { type: "accept" }
            }
        })

        const opMw = defineMiddleware({
            name: "op-check",
            docs: "Operation validation",
            async handler() {
                executionOrder.push("op-mw-reject")
                return { type: "reject", reason: "Blocked" }
            }
        })

        const capability = defineCapability({
            name: "test",
            docs: "Test capability",
            operations: {
                blocked: defineOperation({
                    name: "blocked",
                    docs: "Blocked operation",
                    signature: "function blocked(): Promise<void>",
                    middleware: [opMw],
                    async handler() {
                        executionOrder.push("handler")
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const,
            middleware: [capsuleMw]
        })

        await capsule.boot()

        await assertRejects(
            capsule.trigger("test", "blocked", undefined),
            "Blocked"
        )

        // Capsule middleware ran, then operation middleware rejected
        expect(executionOrder).toEqual(["capsule-mw", "op-mw-reject"])

        await capsule.shutdown()
    })

    test("multiple operation-level middleware run in order", async () => {
        const executionOrder: string[] = []

        const mw1 = defineMiddleware({
            name: "mw1",
            docs: "First operation middleware",
            async handler() {
                executionOrder.push("op-mw-1")
                return { type: "accept" }
            }
        })

        const mw2 = defineMiddleware({
            name: "mw2",
            docs: "Second operation middleware",
            async handler() {
                executionOrder.push("op-mw-2")
                return { type: "accept" }
            }
        })

        const capability = defineCapability({
            name: "test",
            docs: "Test capability",
            operations: {
                multiMw: defineOperation({
                    name: "multiMw",
                    docs: "Has multiple middleware",
                    signature: "function multiMw(): Promise<void>",
                    middleware: [mw1, mw2],
                    async handler() {
                        executionOrder.push("handler")
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()
        await capsule.trigger("test", "multiMw", undefined)

        expect(executionOrder).toEqual(["op-mw-1", "op-mw-2", "handler"])

        await capsule.shutdown()
    })

    test("operation without middleware still runs capsule middleware", async () => {
        let capsuleMwRan = false
        let handlerRan = false

        const capsuleMw = defineMiddleware({
            name: "capsule-mw",
            docs: "Runs for all ops",
            async handler() {
                capsuleMwRan = true
                return { type: "accept" }
            }
        })

        const capability = defineCapability({
            name: "test",
            docs: "Test capability",
            operations: {
                noOpMw: defineOperation({
                    name: "noOpMw",
                    docs: "No operation middleware",
                    signature: "function noOpMw(): Promise<void>",
                    async handler() {
                        handlerRan = true
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const,
            middleware: [capsuleMw]
        })

        await capsule.boot()
        await capsule.trigger("test", "noOpMw", undefined)

        expect(capsuleMwRan).toBe(true)
        expect(handlerRan).toBe(true)

        await capsule.shutdown()
    })

    test("different operations can have different middleware", async () => {
        const mw1Calls: string[] = []
        const mw2Calls: string[] = []

        const mw1 = defineMiddleware({
            name: "mw1",
            docs: "Middleware 1",
            async handler({ operation }: any) {
                mw1Calls.push(operation)
                return { type: "accept" }
            }
        })

        const mw2 = defineMiddleware({
            name: "mw2",
            docs: "Middleware 2",
            async handler({ operation }: any) {
                mw2Calls.push(operation)
                return { type: "accept" }
            }
        })

        const capability = defineCapability({
            name: "test",
            docs: "Test capability",
            operations: {
                op1: defineOperation({
                    name: "op1",
                    docs: "Has mw1",
                    signature: "function op1(): Promise<void>",
                    middleware: [mw1],
                    async handler() {}
                }),
                op2: defineOperation({
                    name: "op2",
                    docs: "Has mw2",
                    signature: "function op2(): Promise<void>",
                    middleware: [mw2],
                    async handler() {}
                }),
                op3: defineOperation({
                    name: "op3",
                    docs: "Has both",
                    signature: "function op3(): Promise<void>",
                    middleware: [mw1, mw2],
                    async handler() {}
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()

        await capsule.trigger("test", "op1", undefined)
        await capsule.trigger("test", "op2", undefined)
        await capsule.trigger("test", "op3", undefined)

        expect(mw1Calls).toEqual(["op1", "op3"])
        expect(mw2Calls).toEqual(["op2", "op3"])

        await capsule.shutdown()
    })
})
