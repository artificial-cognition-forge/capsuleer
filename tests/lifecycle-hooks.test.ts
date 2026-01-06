/**
 * Lifecycle Hooks Execution Tests
 *
 * Validates that boot() and shutdown() hooks:
 * - Execute at the correct time
 * - Receive lifecycle context with emit capability
 * - Can emit stimuli
 * - Do NOT receive trigger() capability
 * - Errors prevent state transitions
 */

import { describe, test, expect } from "bun:test"
import { createTestCapsule, collectStimuli, assertRejects } from "@tests/helpers"
import { Capsule, defineCapability, defineOperation } from "@src/exports"

describe("Lifecycle Hooks", () => {
    test("boot() hook is called during boot", async () => {
        let bootCalled = false

        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async boot() {
                    bootCalled = true
                }
            }
        })

        expect(bootCalled).toBe(false)
        await capsule.boot()
        expect(bootCalled).toBe(true)

        await capsule.shutdown()
    })

    test("shutdown() hook is called during shutdown", async () => {
        let shutdownCalled = false

        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async shutdown() {
                    shutdownCalled = true
                }
            }
        })

        await capsule.boot()
        expect(shutdownCalled).toBe(false)
        await capsule.shutdown()
        expect(shutdownCalled).toBe(true)
    })

    test("boot hook receives lifecycle context with emit capability", async () => {
        let contextReceived: any = null

        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async boot(ctx) {
                    contextReceived = ctx
                }
            }
        })

        await capsule.boot()

        expect(contextReceived).not.toBeNull()
        expect(contextReceived.capsule).toBeDefined()
        expect(typeof contextReceived.capsule.emit).toBe("function")

        await capsule.shutdown()
    })

    test("shutdown hook receives lifecycle context with emit capability", async () => {
        let contextReceived: any = null

        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async shutdown(ctx) {
                    contextReceived = ctx
                }
            }
        })

        await capsule.boot()
        await capsule.shutdown()

        expect(contextReceived).not.toBeNull()
        expect(contextReceived.capsule).toBeDefined()
        expect(typeof contextReceived.capsule.emit).toBe("function")
    })

    test("boot hook can emit stimuli", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async boot({ capsule }) {
                    capsule.emit({
                        sense: "boot:started",
                        data: { message: "Capsule is booting" }
                    })
                }
            }
        })

        const { stimuli, unsubscribe } = collectStimuli(capsule)

        await capsule.boot()

        expect(stimuli.length).toBe(1)
        expect(stimuli[0].sense).toBe("boot:started")
        expect(stimuli[0].data).toEqual({ message: "Capsule is booting" })
        expect(stimuli[0].timestamp).toBeDefined()

        unsubscribe()
        await capsule.shutdown()
    })

    test("shutdown hook can emit stimuli", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async shutdown({ capsule }) {
                    capsule.emit({
                        sense: "shutdown:started",
                        data: { message: "Capsule is shutting down" }
                    })
                }
            }
        })

        const { stimuli, unsubscribe } = collectStimuli(capsule)

        await capsule.boot()
        await capsule.shutdown()

        expect(stimuli.length).toBe(1)
        expect(stimuli[0].sense).toBe("shutdown:started")
        expect(stimuli[0].data).toEqual({ message: "Capsule is shutting down" })

        unsubscribe()
    })

    test("boot hook error prevents state transition", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async boot() {
                    throw new Error("Boot failed")
                }
            }
        })

        await assertRejects(capsule.boot(), "Boot failed")

        // Capsule should still be in created state - trigger should fail
        await assertRejects(
            capsule.trigger("test", "noop", undefined),
            "capsule is created"
        )
    })

    test("shutdown hook error propagates but completes shutdown", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async shutdown() {
                    throw new Error("Shutdown failed")
                }
            }
        })

        await capsule.boot()

        // Shutdown should propagate error
        await assertRejects(capsule.shutdown(), "Shutdown failed")

        // But capsule should still be shutdown - trigger should fail
        await assertRejects(
            capsule.trigger("test", "noop", undefined),
            "capsule is shutdown"
        )
    })

    test("hooks do NOT receive trigger() capability", async () => {
        // This is enforced by TypeScript - the LifecycleContext only provides emit
        // We verify at runtime that the context doesn't have trigger

        let bootContext: any = null
        let shutdownContext: any = null

        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async boot(ctx) {
                    bootContext = ctx
                },
                async shutdown(ctx) {
                    shutdownContext = ctx
                }
            }
        })

        await capsule.boot()
        await capsule.shutdown()

        // Verify context only has emit, not trigger
        expect(bootContext.capsule.emit).toBeDefined()
        expect(bootContext.capsule.trigger).toBeUndefined()

        expect(shutdownContext.capsule.emit).toBeDefined()
        expect(shutdownContext.capsule.trigger).toBeUndefined()
    })

    test("boot hook can set up external streams", async () => {
        // Simulate setting up a stream that emits periodically
        let intervalId: Timer | null = null

        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async boot({ capsule }) {
                    let count = 0
                    intervalId = setInterval(() => {
                        capsule.emit({
                            sense: "stream:tick",
                            data: { count: count++ }
                        })
                    }, 10)
                },
                async shutdown() {
                    if (intervalId) {
                        clearInterval(intervalId)
                    }
                }
            }
        })

        const { stimuli, unsubscribe } = collectStimuli(capsule)

        await capsule.boot()

        // Wait for a few ticks
        await new Promise(resolve => setTimeout(resolve, 35))

        await capsule.shutdown()

        // Should have received multiple ticks
        expect(stimuli.length).toBeGreaterThan(2)
        expect(stimuli.every(s => s.sense === "stream:tick")).toBe(true)

        unsubscribe()
    })

    test("hook emits do NOT have source provenance", async () => {
        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async boot({ capsule }) {
                    capsule.emit({
                        sense: "boot:message",
                        data: "from boot hook"
                    })
                }
            }
        })

        const { stimuli, unsubscribe } = collectStimuli(capsule)

        await capsule.boot()

        expect(stimuli.length).toBe(1)
        expect(stimuli[0].sense).toBe("boot:message")
        expect(stimuli[0].source).toBeUndefined() // No provenance from hooks

        unsubscribe()
        await capsule.shutdown()
    })

    test("both hooks execute in correct order", async () => {
        const executionOrder: string[] = []

        const capsule = createTestCapsule({
            operations: {
                noop: async () => "ok"
            },
            hooks: {
                async boot() {
                    executionOrder.push("boot")
                },
                async shutdown() {
                    executionOrder.push("shutdown")
                }
            }
        })

        await capsule.boot()
        expect(executionOrder).toEqual(["boot"])

        await capsule.shutdown()
        expect(executionOrder).toEqual(["boot", "shutdown"])
    })
})
