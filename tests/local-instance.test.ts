/**
 * LocalCapsuleInstance Tests
 *
 * Verifies that LocalCapsuleInstance correctly wraps and delegates to Capsule.
 * These tests ensure the transport layer is transparent to the Mind.
 */

import { describe, test, expect } from "bun:test"
import { createTestCapsule, collectStimuli, assertRejects } from "@tests/helpers"
import { LocalCapsuleInstance } from "@src/local"

describe("LocalCapsuleInstance", () => {
    test("wraps local Capsule implementation", async () => {
        let called = false

        const def = {
            name: "test",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        marker: {
                            name: "marker",
                            docs: "Mark that operation ran",
                            signature: "() => Promise<void>",
                            handler: async () => {
                                called = true
                            }
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)

        await capsule.boot()
        await capsule.trigger("test", "marker", undefined)
        expect(called).toBe(true)
        await capsule.shutdown()
    })

    test("describe() returns metadata", async () => {
        const def = {
            name: "my-capsule",
            docs: "Test capsule for describe",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        op: {
                            name: "op",
                            docs: "Test operation",
                            signature: "() => Promise<void>",
                            handler: async () => {}
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)
        const metadata = capsule.describe()

        expect(metadata.name).toBe("my-capsule")
        expect(metadata.capabilities.length).toBe(1)
        expect(metadata.capabilities[0].name).toBe("test")
    })

    test("boot() and shutdown() are idempotent", async () => {
        const def = {
            name: "test",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        noop: {
                            name: "noop",
                            docs: "No-op",
                            signature: "() => Promise<void>",
                            handler: async () => {}
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)

        // Multiple boots should be safe
        await capsule.boot()
        await capsule.boot()

        await capsule.trigger("test", "noop", undefined)

        // Multiple shutdowns should be safe
        await capsule.shutdown()
        await capsule.shutdown()
    })

    test("trigger() returns operation results", async () => {
        const def = {
            name: "test",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        compute: {
                            name: "compute",
                            docs: "Compute a value",
                            signature: "() => Promise<number>",
                            handler: async () => 42
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)

        await capsule.boot()
        const result = await capsule.trigger("test", "compute", undefined)
        expect(result).toBe(42)
        await capsule.shutdown()
    })

    test("onStimulus() receives emissions from operations", async () => {
        const stimuli: any[] = []

        const def = {
            name: "test",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        emit: {
                            name: "emit",
                            docs: "Emit a stimulus",
                            signature: "() => Promise<void>",
                            handler: async ({ emit }: any) => {
                                emit({ sense: "test:signal", data: "hello" })
                            }
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)
        const unsub = capsule.onStimulus((s) => stimuli.push(s))

        await capsule.boot()
        await capsule.trigger("test", "emit", undefined)

        expect(stimuli.length).toBe(1)
        expect(stimuli[0].sense).toBe("test:signal")
        expect(stimuli[0].data).toBe("hello")

        unsub()
        await capsule.shutdown()
    })

    test("stimuli include provenance from operations", async () => {
        const stimuli: any[] = []

        const def = {
            name: "test",
            capabilities: [
                {
                    name: "work",
                    docs: "Work capability",
                    operations: {
                        process: {
                            name: "process",
                            docs: "Process something",
                            signature: "() => Promise<void>",
                            handler: async ({ emit }: any) => {
                                emit({ sense: "work:done", data: {} })
                            }
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)
        capsule.onStimulus((s) => stimuli.push(s))

        await capsule.boot()
        await capsule.trigger("work", "process", undefined)

        expect(stimuli.length).toBe(1)
        expect(stimuli[0].source?.capability).toBe("work")
        expect(stimuli[0].source?.operation).toBe("process")

        await capsule.shutdown()
    })

    test("trigger() throws if not booted", async () => {
        const def = {
            name: "test",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        op: {
                            name: "op",
                            docs: "Operation",
                            signature: "() => Promise<void>",
                            handler: async () => {}
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)

        await assertRejects(
            capsule.trigger("test", "op", undefined),
            "Cannot trigger operations: capsule is created"
        )
    })

    test("trigger() throws if shutdown", async () => {
        const def = {
            name: "test",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        op: {
                            name: "op",
                            docs: "Operation",
                            signature: "() => Promise<void>",
                            handler: async () => {}
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)

        await capsule.boot()
        await capsule.shutdown()

        await assertRejects(
            capsule.trigger("test", "op", undefined),
            "Cannot trigger operations: capsule is shutdown"
        )
    })

    test("abort signal propagates to handlers", async () => {
        let wasAborted = false

        const def = {
            name: "test",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        checkAbort: {
                            name: "checkAbort",
                            docs: "Check abort",
                            signature: "() => Promise<void>",
                            handler: async ({ signal }: any) => {
                                wasAborted = signal.aborted
                            }
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)

        await capsule.boot()

        const controller = new AbortController()
        controller.abort()

        await assertRejects(
            capsule.trigger("test", "checkAbort", undefined, controller.signal),
            "Operation aborted"
        )

        await capsule.shutdown()
    })

    test("multiple concurrent triggers work", async () => {
        const results: number[] = []

        const def = {
            name: "test",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        delay: {
                            name: "delay",
                            docs: "Delayed operation",
                            signature: "() => Promise<number>",
                            handler: async ({ params }: any) => {
                                await new Promise((resolve) => setTimeout(resolve, params.ms))
                                results.push(params.value)
                                return params.value
                            }
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)

        await capsule.boot()

        const promises = [
            capsule.trigger("test", "delay", { ms: 30, value: 1 }),
            capsule.trigger("test", "delay", { ms: 10, value: 2 }),
            capsule.trigger("test", "delay", { ms: 20, value: 3 })
        ]

        await Promise.all(promises)

        // Results should complete in order of delay (shortest first)
        expect(results).toEqual([2, 3, 1])

        await capsule.shutdown()
    })

    test("emit() from lifecycle hook works", async () => {
        const stimuli: any[] = []

        const def = {
            name: "test",
            capabilities: [
                {
                    name: "test",
                    docs: "Test capability",
                    operations: {
                        noop: {
                            name: "noop",
                            docs: "No-op",
                            signature: "() => Promise<void>",
                            handler: async () => {}
                        }
                    }
                }
            ],
            hooks: {
                boot: async ({ capsule }: any) => {
                    capsule.emit({ sense: "lifecycle:boot", data: { phase: "starting" } })
                }
            }
        }

        const capsule = LocalCapsuleInstance(def)
        capsule.onStimulus((s) => stimuli.push(s))

        await capsule.boot()

        expect(stimuli.length).toBe(1)
        expect(stimuli[0].sense).toBe("lifecycle:boot")
        expect(stimuli[0].source).toBeUndefined() // No provenance from lifecycle hooks

        await capsule.shutdown()
    })

    test("type safety is preserved", async () => {
        const def = {
            name: "test",
            capabilities: [
                {
                    name: "math",
                    docs: "Math capability",
                    operations: {
                        add: {
                            name: "add",
                            docs: "Add two numbers",
                            signature: "(a: number, b: number) => Promise<number>",
                            handler: async ({ params }: any) => params.a + params.b
                        }
                    }
                }
            ]
        }

        const capsule = LocalCapsuleInstance(def)

        await capsule.boot()

        // Type safety test - these should compile without errors
        const result: number = await capsule.trigger("math", "add", { a: 10, b: 32 })
        expect(result).toBe(42)

        await capsule.shutdown()
    })
})
