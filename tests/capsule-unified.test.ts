/**
 * Unified Capsule API Tests
 *
 * Verifies that the new unified Capsule() function correctly routes
 * to local and remote implementations based on transport configuration.
 */

import { describe, test, expect } from "bun:test"
import { Capsule, type CapsuleConfig } from "@src/Capsule"
import type { SSHConfig } from "@src/transports/types"

describe("Unified Capsule API", () => {
    test("creates local capsule with transport: 'local'", async () => {
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

        const capsule = Capsule({
            def,
            transport: 'local'
        })

        await capsule.boot()
        await capsule.trigger("test", "marker", undefined)
        expect(called).toBe(true)
        await capsule.shutdown()
    })

    test("type signature enforces required fields for local", () => {
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

        // This should compile - local only needs def and transport
        const config: CapsuleConfig = {
            def,
            transport: 'local'
        }

        expect(config.transport).toBe('local')
    })

    test("type signature enforces required fields for SSH", () => {
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

        const sshConfig: SSHConfig = {
            host: "example.com",
            username: "user",
            auth: { type: "key", path: "~/.ssh/id_rsa" },
            capsulePath: "/usr/local/bin/capsule"
        }

        // This should compile - ssh needs def, transport, ssh config, and remoteName
        const config: CapsuleConfig = {
            def,
            transport: 'ssh',
            ssh: sshConfig,
            remoteName: 'my-capsule'
        }

        expect(config.transport).toBe('ssh')
        expect(config.remoteName).toBe('my-capsule')
    })

    test("describe() returns metadata for local capsule", async () => {
        const def = {
            name: "my-capsule",
            docs: "Test capsule",
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

        const capsule = Capsule({
            def,
            transport: 'local'
        })

        const metadata = capsule.describe()
        expect(metadata.name).toBe("my-capsule")
        expect(metadata.docs).toBe("Test capsule")
        expect(metadata.capabilities.length).toBe(1)
    })

    test("trigger() returns operation results for local capsule", async () => {
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

        const capsule = Capsule({
            def,
            transport: 'local'
        })

        await capsule.boot()
        const result = await capsule.trigger("test", "compute", undefined)
        expect(result).toBe(42)
        await capsule.shutdown()
    })

    test("onStimulus() receives emissions for local capsule", async () => {
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

        const capsule = Capsule({
            def,
            transport: 'local'
        })

        const unsub = capsule.onStimulus((s) => stimuli.push(s))

        await capsule.boot()
        await capsule.trigger("test", "emit", undefined)

        expect(stimuli.length).toBe(1)
        expect(stimuli[0].sense).toBe("test:signal")

        unsub()
        await capsule.shutdown()
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

        const capsule = Capsule({
            def,
            transport: 'local'
        })

        // Multiple boots should be safe
        await capsule.boot()
        await capsule.boot()

        await capsule.trigger("test", "noop", undefined)

        // Multiple shutdowns should be safe
        await capsule.shutdown()
        await capsule.shutdown()

        expect(true).toBe(true)
    })
})
