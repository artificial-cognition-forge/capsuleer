/**
 * Metadata Introspection Tests
 *
 * Validates that describe():
 * - Returns correct capsule name and docs
 * - Includes all capabilities
 * - Includes all operations with signatures
 * - Includes all declared senses
 * - Matches CapsuleMetadata type structure
 */

import { describe, test, expect } from "bun:test"
import { Capsule, defineCapability, defineOperation } from "../src/exports"

describe("Metadata Introspection", () => {
    test("describe() returns correct capsule name", async () => {
        const capsule = Capsule({
            name: "test-capsule",
            capabilities: []
        })

        const metadata = capsule.describe()
        expect(metadata.name).toBe("test-capsule")
    })

    test("describe() returns capsule docs", async () => {
        const capsule = Capsule({
            name: "test-capsule",
            docs: "This is a test capsule for validation",
            capabilities: []
        })

        const metadata = capsule.describe()
        expect(metadata.docs).toBe("This is a test capsule for validation")
    })

    test("describe() includes all capabilities", async () => {
        const cap1 = defineCapability({
            name: "capability-1",
            docs: "First capability",
            operations: {}
        })

        const cap2 = defineCapability({
            name: "capability-2",
            docs: "Second capability",
            operations: {}
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [cap1, cap2] as const
        })

        const metadata = capsule.describe()

        expect(metadata.capabilities.length).toBe(2)
        expect(metadata.capabilities[0].name).toBe("capability-1")
        expect(metadata.capabilities[0].docs).toBe("First capability")
        expect(metadata.capabilities[1].name).toBe("capability-2")
        expect(metadata.capabilities[1].docs).toBe("Second capability")
    })

    test("describe() includes all operations with signatures", async () => {
        const capability = defineCapability({
            name: "math",
            docs: "Math operations",
            operations: {
                add: defineOperation<{ a: number; b: number }, number>({
                    name: "add",
                    docs: "Add two numbers",
                    signature: "function add(params: { a: number, b: number }): Promise<number>",
                    async handler({ params }) {
                        return params.a + params.b
                    }
                }),
                multiply: defineOperation<{ a: number; b: number }, number>({
                    name: "multiply",
                    docs: "Multiply two numbers",
                    signature: "function multiply(params: { a: number, b: number }): Promise<number>",
                    async handler({ params }) {
                        return params.a * params.b
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        const metadata = capsule.describe()

        expect(metadata.capabilities.length).toBe(1)
        expect(metadata.capabilities[0].name).toBe("math")
        expect(metadata.capabilities[0].operations.length).toBe(2)

        const addOp = metadata.capabilities[0].operations.find(op => op.name === "add")
        expect(addOp).toBeDefined()
        expect(addOp!.docs).toBe("Add two numbers")
        expect(addOp!.signature).toBe("function add(params: { a: number, b: number }): Promise<number>")

        const multiplyOp = metadata.capabilities[0].operations.find(op => op.name === "multiply")
        expect(multiplyOp).toBeDefined()
        expect(multiplyOp!.docs).toBe("Multiply two numbers")
        expect(multiplyOp!.signature).toBe("function multiply(params: { a: number, b: number }): Promise<number>")
    })

    test("describe() includes declared senses", async () => {
        const capsule = Capsule({
            name: "test",
            capabilities: [],
            senses: [
                {
                    name: "sensor:temperature",
                    docs: "Temperature readings in celsius",
                    signature: "{ value: number, unit: string }"
                },
                {
                    name: "sensor:humidity",
                    docs: "Humidity percentage",
                    signature: "{ percentage: number }"
                }
            ]
        })

        const metadata = capsule.describe()

        expect(metadata.senses).toBeDefined()
        expect(metadata.senses!.length).toBe(2)

        expect(metadata.senses![0].name).toBe("sensor:temperature")
        expect(metadata.senses![0].docs).toBe("Temperature readings in celsius")
        expect(metadata.senses![0].signature).toBe("{ value: number, unit: string }")

        expect(metadata.senses![1].name).toBe("sensor:humidity")
        expect(metadata.senses![1].docs).toBe("Humidity percentage")
        expect(metadata.senses![1].signature).toBe("{ percentage: number }")
    })

    test("describe() structure matches CapsuleMetadata type", async () => {
        const capability = defineCapability({
            name: "test-cap",
            docs: "Test capability",
            operations: {
                testOp: defineOperation({
                    name: "testOp",
                    docs: "Test operation",
                    signature: "function testOp(): Promise<void>",
                    async handler() {}
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            docs: "Test capsule",
            capabilities: [capability] as const,
            senses: [
                {
                    name: "test:sense",
                    docs: "Test sense",
                    signature: "any"
                }
            ]
        })

        const metadata = capsule.describe()

        // Verify structure
        expect(typeof metadata.name).toBe("string")
        expect(typeof metadata.docs).toBe("string")
        expect(Array.isArray(metadata.capabilities)).toBe(true)
        expect(Array.isArray(metadata.senses)).toBe(true)

        // Verify capability structure
        const cap = metadata.capabilities[0]
        expect(typeof cap.name).toBe("string")
        expect(typeof cap.docs).toBe("string")
        expect(Array.isArray(cap.operations)).toBe(true)

        // Verify operation structure
        const op = cap.operations[0]
        expect(typeof op.name).toBe("string")
        expect(typeof op.docs).toBe("string")
        expect(typeof op.signature).toBe("string")

        // Verify sense structure
        const sense = metadata.senses![0]
        expect(typeof sense.name).toBe("string")
        expect(typeof sense.docs).toBe("string")
        expect(typeof sense.signature).toBe("string")
    })

    test("describe() works for capsule with no senses", async () => {
        const capsule = Capsule({
            name: "test",
            capabilities: []
        })

        const metadata = capsule.describe()

        expect(metadata.senses).toBeUndefined()
    })

    test("describe() works for capsule with no docs", async () => {
        const capsule = Capsule({
            name: "test",
            capabilities: []
        })

        const metadata = capsule.describe()

        expect(metadata.docs).toBeUndefined()
    })

    test("describe() includes multiple capabilities with operations", async () => {
        const filesystem = defineCapability({
            name: "filesystem",
            docs: "Filesystem operations",
            operations: {
                read: defineOperation({
                    name: "read",
                    docs: "Read a file",
                    signature: "function read(params: { path: string }): Promise<string>",
                    async handler() {
                        return "file contents"
                    }
                }),
                write: defineOperation({
                    name: "write",
                    docs: "Write a file",
                    signature: "function write(params: { path: string, content: string }): Promise<void>",
                    async handler() {}
                })
            }
        })

        const network = defineCapability({
            name: "network",
            docs: "Network operations",
            operations: {
                fetch: defineOperation({
                    name: "fetch",
                    docs: "Fetch a URL",
                    signature: "function fetch(params: { url: string }): Promise<string>",
                    async handler() {
                        return "response"
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "multi-capability-capsule",
            docs: "A capsule with multiple capabilities",
            capabilities: [filesystem, network] as const,
            senses: [
                {
                    name: "fs:change",
                    docs: "File system change event",
                    signature: "{ path: string, type: string }"
                },
                {
                    name: "net:request",
                    docs: "Network request event",
                    signature: "{ url: string, method: string }"
                }
            ]
        })

        const metadata = capsule.describe()

        expect(metadata.name).toBe("multi-capability-capsule")
        expect(metadata.docs).toBe("A capsule with multiple capabilities")

        expect(metadata.capabilities.length).toBe(2)

        const fs = metadata.capabilities.find(c => c.name === "filesystem")
        expect(fs).toBeDefined()
        expect(fs!.docs).toBe("Filesystem operations")
        expect(fs!.operations.length).toBe(2)
        expect(fs!.operations.map(op => op.name)).toEqual(["read", "write"])

        const net = metadata.capabilities.find(c => c.name === "network")
        expect(net).toBeDefined()
        expect(net!.docs).toBe("Network operations")
        expect(net!.operations.length).toBe(1)
        expect(net!.operations[0].name).toBe("fetch")

        expect(metadata.senses!.length).toBe(2)
        expect(metadata.senses!.map(s => s.name)).toEqual(["fs:change", "net:request"])
    })

    test("describe() can be called multiple times", async () => {
        const capsule = Capsule({
            name: "test",
            docs: "Test capsule",
            capabilities: []
        })

        const metadata1 = capsule.describe()
        const metadata2 = capsule.describe()

        expect(metadata1).toEqual(metadata2)
        expect(metadata1.name).toBe("test")
        expect(metadata2.name).toBe("test")
    })

    test("describe() works before boot", async () => {
        const capsule = Capsule({
            name: "test",
            capabilities: []
        })

        // Should work before boot
        const metadata = capsule.describe()
        expect(metadata.name).toBe("test")
    })

    test("describe() works after boot", async () => {
        const capsule = Capsule({
            name: "test",
            capabilities: []
        })

        await capsule.boot()

        const metadata = capsule.describe()
        expect(metadata.name).toBe("test")

        await capsule.shutdown()
    })

    test("describe() works after shutdown", async () => {
        const capsule = Capsule({
            name: "test",
            capabilities: []
        })

        await capsule.boot()
        await capsule.shutdown()

        const metadata = capsule.describe()
        expect(metadata.name).toBe("test")
    })
})
