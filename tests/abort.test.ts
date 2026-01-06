/**
 * Interruptibility (AbortSignal) Tests
 *
 * Validates that AbortSignal:
 * - Propagates to middleware
 * - Propagates to handlers
 * - Pre-aborted signal rejects trigger immediately
 * - Abort during execution can be checked
 * - shutdown() aborts all in-flight operations
 * - Operations cleanup after abort
 */

import { describe, test, expect } from "bun:test"
import { createTestCapsule, createAbortableOperation, assertRejects, sleep } from "@tests/helpers"
import { defineMiddleware } from "@src/exports"

describe("Interruptibility (AbortSignal)", () => {
    test("external abort signal propagates to middleware", async () => {
        let middlewareReceivedSignal: AbortSignal | null = null

        const middleware = defineMiddleware({
            name: "signal-checker",
            docs: "Checks abort signal",
            async handler({ signal }: any) {
                middlewareReceivedSignal = signal
                return { type: "accept" }
            }
        })

        const capsule = createTestCapsule({
            operations: {
                test: async () => "ok"
            },
            middleware: [middleware]
        })

        const controller = new AbortController()

        await capsule.boot()
        await capsule.trigger("test", "test", undefined, controller.signal)

        expect(middlewareReceivedSignal).not.toBeNull()
        expect(middlewareReceivedSignal).toBeInstanceOf(AbortSignal)
        expect(middlewareReceivedSignal!.aborted).toBe(false)

        await capsule.shutdown()
    })

    test("external abort signal propagates to handler", async () => {
        let handlerReceivedSignal: AbortSignal | null = null

        const capsule = createTestCapsule({
            operations: {
                checkSignal: async ({ signal }: any) => {
                    handlerReceivedSignal = signal
                    return "ok"
                }
            }
        })

        const controller = new AbortController()

        await capsule.boot()
        await capsule.trigger("test", "checkSignal", undefined, controller.signal)

        expect(handlerReceivedSignal).not.toBeNull()
        expect(handlerReceivedSignal).toBeInstanceOf(AbortSignal)
        expect(handlerReceivedSignal!.aborted).toBe(false)

        await capsule.shutdown()
    })

    test("pre-aborted signal rejects trigger immediately", async () => {
        const capsule = createTestCapsule({
            operations: {
                neverRuns: async () => "should not execute"
            }
        })

        const controller = new AbortController()
        controller.abort("pre-aborted")

        await capsule.boot()

        await assertRejects(
            capsule.trigger("test", "neverRuns", undefined, controller.signal),
            "Operation aborted"
        )

        await capsule.shutdown()
    })

    test("abort during handler execution can be checked", async () => {
        let abortDetected = false

        const capsule = createTestCapsule({
            operations: {
                longRunning: async ({ signal }: any) => {
                    for (let i = 0; i < 100; i++) {
                        if (signal.aborted) {
                            abortDetected = true
                            throw new Error(`Aborted: ${signal.reason}`)
                        }
                        await sleep(10)
                    }
                    return "completed"
                }
            }
        })

        const controller = new AbortController()

        await capsule.boot()

        const triggerPromise = capsule.trigger("test", "longRunning", undefined, controller.signal)

        // Abort after a short delay
        await sleep(30)
        controller.abort("user")

        await assertRejects(triggerPromise, "Aborted: user")
        expect(abortDetected).toBe(true)

        await capsule.shutdown()
    })

    test("shutdown() aborts all in-flight operations", async () => {
        const results: string[] = []

        const capsule = createTestCapsule({
            operations: {
                long: createAbortableOperation(500, 10)
            }
        })

        await capsule.boot()

        // Start multiple long-running operations
        const p1 = capsule.trigger("test", "long", undefined).catch(e => results.push("op1-aborted"))
        const p2 = capsule.trigger("test", "long", undefined).catch(e => results.push("op2-aborted"))
        const p3 = capsule.trigger("test", "long", undefined).catch(e => results.push("op3-aborted"))

        // Wait a bit to ensure operations are in-flight
        await sleep(50)

        // Shutdown should abort all of them
        await capsule.shutdown()

        // Wait for promises to settle
        await Promise.allSettled([p1, p2, p3])

        expect(results).toContain("op1-aborted")
        expect(results).toContain("op2-aborted")
        expect(results).toContain("op3-aborted")
    })

    test("abort controller cleanup after operation completes", async () => {
        const capsule = createTestCapsule({
            operations: {
                quick: async () => {
                    await sleep(10)
                    return "done"
                }
            }
        })

        await capsule.boot()

        // Run an operation to completion
        const result = await capsule.trigger("test", "quick", undefined)
        expect(result).toBe("done")

        // The operation should be removed from in-flight tracking
        // We can't directly test this, but shutdown should complete quickly
        const shutdownStart = Date.now()
        await capsule.shutdown()
        const shutdownDuration = Date.now() - shutdownStart

        // Shutdown should be fast since no operations are in-flight
        expect(shutdownDuration).toBeLessThan(100)
    })

    test("multiple in-flight operations abort independently", async () => {
        const capsule = createTestCapsule({
            operations: {
                abortable: createAbortableOperation(1000, 10)
            }
        })

        await capsule.boot()

        const controller1 = new AbortController()
        const controller2 = new AbortController()

        const p1 = capsule.trigger("test", "abortable", undefined, controller1.signal)
        const p2 = capsule.trigger("test", "abortable", undefined, controller2.signal)

        await sleep(50)

        // Abort only the first one
        controller1.abort("abort-1")

        await assertRejects(p1, "Aborted: abort-1")

        // Second one should still be running
        await sleep(50)

        // Now abort the second one
        controller2.abort("abort-2")

        await assertRejects(p2, "Aborted: abort-2")

        await capsule.shutdown()
    })

    test("abort during middleware execution stops handler", async () => {
        let handlerRan = false

        const slowMiddleware = defineMiddleware({
            name: "slow",
            docs: "Slow middleware",
            async handler({ signal }: any) {
                await sleep(50)
                if (signal.aborted) {
                    throw new Error(`Middleware aborted: ${signal.reason}`)
                }
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
            middleware: [slowMiddleware]
        })

        const controller = new AbortController()

        await capsule.boot()

        const triggerPromise = capsule.trigger("test", "test", undefined, controller.signal)

        // Abort during middleware execution
        await sleep(25)
        controller.abort("during-middleware")

        await assertRejects(triggerPromise, "Middleware aborted: during-middleware")
        expect(handlerRan).toBe(false)

        await capsule.shutdown()
    })

    test("handler respecting signal completes gracefully on abort", async () => {
        let cleanupCalled = false

        const capsule = createTestCapsule({
            operations: {
                respectful: async ({ signal }: any) => {
                    try {
                        for (let i = 0; i < 100; i++) {
                            if (signal.aborted) {
                                throw new Error("Operation cancelled")
                            }
                            await sleep(10)
                        }
                        return "completed"
                    } finally {
                        cleanupCalled = true
                    }
                }
            }
        })

        const controller = new AbortController()

        await capsule.boot()

        const triggerPromise = capsule.trigger("test", "respectful", undefined, controller.signal)

        await sleep(30)
        controller.abort()

        await assertRejects(triggerPromise, "Operation cancelled")
        expect(cleanupCalled).toBe(true)

        await capsule.shutdown()
    })

    test("abort signal reason is preserved", async () => {
        let receivedReason: any = null

        const capsule = createTestCapsule({
            operations: {
                checkReason: async ({ signal }: any) => {
                    for (let i = 0; i < 100; i++) {
                        if (signal.aborted) {
                            receivedReason = signal.reason
                            throw new Error(`Aborted with reason: ${signal.reason}`)
                        }
                        await sleep(10)
                    }
                    return "completed"
                }
            }
        })

        const controller = new AbortController()

        await capsule.boot()

        const triggerPromise = capsule.trigger("test", "checkReason", undefined, controller.signal)

        await sleep(30)
        controller.abort("custom-reason")

        await assertRejects(triggerPromise)
        expect(receivedReason).toBe("custom-reason")

        await capsule.shutdown()
    })

    test("operation without explicit abort check still completes", async () => {
        // An operation that doesn't check signal should still complete normally
        const capsule = createTestCapsule({
            operations: {
                ignorant: async () => {
                    await sleep(50)
                    return "done"
                }
            }
        })

        const controller = new AbortController()

        await capsule.boot()

        const triggerPromise = capsule.trigger("test", "ignorant", undefined, controller.signal)

        // Abort signal won't stop the operation if it doesn't check
        await sleep(25)
        controller.abort()

        // Operation should still complete since it doesn't respect the signal
        const result = await triggerPromise
        expect(result).toBe("done")

        await capsule.shutdown()
    })

    test("signal.addEventListener works in handlers", async () => {
        let abortListenerCalled = false

        const capsule = createTestCapsule({
            operations: {
                withListener: async ({ signal }: any) => {
                    signal.addEventListener("abort", () => {
                        abortListenerCalled = true
                    })

                    for (let i = 0; i < 100; i++) {
                        await sleep(10)
                        if (signal.aborted) {
                            throw new Error("Aborted")
                        }
                    }
                    return "completed"
                }
            }
        })

        const controller = new AbortController()

        await capsule.boot()

        const triggerPromise = capsule.trigger("test", "withListener", undefined, controller.signal)

        await sleep(30)
        controller.abort()

        await assertRejects(triggerPromise, "Aborted")
        expect(abortListenerCalled).toBe(true)

        await capsule.shutdown()
    })
})
