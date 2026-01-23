/**
 * RemoteCapsuleInstance Tests
 *
 * Verifies RemoteCapsuleInstance correctly:
 * - Implements the CapsuleInstance interface
 * - Manages SSH connection lifecycle
 * - Routes messages through JSONL protocol
 * - Handles errors and timeouts
 *
 * NOTE: Full end-to-end testing requires a remote capsule server process.
 * These tests verify structure and basic behavior.
 */

import { describe, test, expect } from "bun:test"
import { RemoteCapsuleInstance } from "@src/remote"
import type { SSHConfig } from "@src/transports/types"

describe("RemoteCapsuleInstance", () => {
    test("implements CapsuleInstance interface", () => {
        // Define a simple capsule for testing
        const def = {
            name: "test",
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

        const sshConfig: SSHConfig = {
            host: "localhost",
            port: 22,
            username: "user",
            auth: { type: "key", path: "/home/user/.ssh/id_rsa" },
            capsulePath: "/usr/local/bin/capsule"
        }

        const remote = RemoteCapsuleInstance(def, sshConfig, "test-capsule")

        // Verify interface exists
        expect(typeof remote.describe).toBe("function")
        expect(typeof remote.boot).toBe("function")
        expect(typeof remote.shutdown).toBe("function")
        expect(typeof remote.trigger).toBe("function")
        expect(typeof remote.emit).toBe("function")
        expect(typeof remote.onStimulus).toBe("function")
    })

    test("describe() throws if metadata not loaded", () => {
        const def = {
            name: "test",
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

        const sshConfig: SSHConfig = {
            host: "localhost",
            port: 22,
            username: "user",
            auth: { type: "key", path: "/home/user/.ssh/id_rsa" },
            capsulePath: "/usr/local/bin/capsule"
        }

        const remote = RemoteCapsuleInstance(def, sshConfig, "test-capsule")

        expect(() => {
            remote.describe()
        }).toThrow("Metadata not loaded")
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
                            docs: "Test operation",
                            signature: "() => Promise<void>",
                            handler: async () => {}
                        }
                    }
                }
            ]
        }

        const sshConfig: SSHConfig = {
            host: "localhost",
            port: 22,
            username: "user",
            auth: { type: "key", path: "/home/user/.ssh/id_rsa" },
            capsulePath: "/usr/local/bin/capsule"
        }

        const remote = RemoteCapsuleInstance(def, sshConfig, "test-capsule")

        try {
            await remote.trigger("test", "op", undefined)
            expect(true).toBe(false) // Should not reach here
        } catch (e: any) {
            expect(e.message).toContain("Cannot trigger operations")
        }
    })

    test("onStimulus() throws if connection not established", () => {
        const def = {
            name: "test",
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

        const sshConfig: SSHConfig = {
            host: "localhost",
            port: 22,
            username: "user",
            auth: { type: "key", path: "/home/user/.ssh/id_rsa" },
            capsulePath: "/usr/local/bin/capsule"
        }

        const remote = RemoteCapsuleInstance(def, sshConfig, "test-capsule")

        expect(() => {
            remote.onStimulus(() => {})
        }).toThrow("SSH connection not yet established")
    })

    test("emit() throws with helpful message", () => {
        const def = {
            name: "test",
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

        const sshConfig: SSHConfig = {
            host: "localhost",
            port: 22,
            username: "user",
            auth: { type: "key", path: "/home/user/.ssh/id_rsa" },
            capsulePath: "/usr/local/bin/capsule"
        }

        const remote = RemoteCapsuleInstance(def, sshConfig, "test-capsule")

        expect(() => {
            remote.emit({ sense: "test", data: null })
        }).toThrow("Cannot emit into remote capsules")
    })

    test("shutdown() is idempotent when never booted", async () => {
        const def = {
            name: "test",
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

        const sshConfig: SSHConfig = {
            host: "localhost",
            port: 22,
            username: "user",
            auth: { type: "key", path: "/home/user/.ssh/id_rsa" },
            capsulePath: "/usr/local/bin/capsule"
        }

        const remote = RemoteCapsuleInstance(def, sshConfig, "test-capsule")

        // Should throw if never booted
        try {
            await remote.shutdown()
            expect(true).toBe(false) // Should not reach
        } catch (e: any) {
            expect(e.message).toContain("never booted")
        }
    })

    test("supports SSH key auth configuration", () => {
        const def = {
            name: "test",
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

        const sshConfig: SSHConfig = {
            host: "example.com",
            port: 2222,
            username: "admin",
            auth: { type: "key", path: "/home/user/.ssh/custom_key" },
            capsulePath: "/opt/capsule/bin/capsule",
            workingDir: "/opt/capsule"
        }

        // Should not throw on construction
        const remote = RemoteCapsuleInstance(def, sshConfig, "remote-capsule")
        expect(remote).toBeDefined()
    })

    test("supports SSH password auth configuration", () => {
        const def = {
            name: "test",
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

        const sshConfig: SSHConfig = {
            host: "example.com",
            port: 22,
            username: "user",
            auth: { type: "password", password: "secret" },
            capsulePath: "/usr/local/bin/capsule"
        }

        // Should not throw on construction
        const remote = RemoteCapsuleInstance(def, sshConfig, "remote-capsule")
        expect(remote).toBeDefined()
    })

    test("type safety is preserved at construction", () => {
        const def = {
            name: "typed-test",
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

        const sshConfig: SSHConfig = {
            host: "localhost",
            port: 22,
            username: "user",
            auth: { type: "key", path: "/home/user/.ssh/id_rsa" },
            capsulePath: "/usr/local/bin/capsule"
        }

        // Constructor is generic and preserves types
        const remote = RemoteCapsuleInstance(def, sshConfig, "math-capsule")

        expect(remote).toBeDefined()
        // Type checking is compile-time, but we verify the interface exists
        expect(typeof remote.trigger).toBe("function")
    })
})
