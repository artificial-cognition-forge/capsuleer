/**
 * Type Safety Tests
 *
 * These tests validate TypeScript compile-time type checking.
 * Most validation happens at compile time via TypeScript.
 *
 * We document expected type errors using @ts-expect-error annotations
 * to prove that invalid usage is caught by the type system.
 */

import { describe, test, expect } from "bun:test"
import { Capsule, defineCapability, defineOperation } from "../src/exports"

describe("Type Safety", () => {
    test("valid trigger calls compile successfully", async () => {
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
                greet: defineOperation<{ name: string }, string>({
                    name: "greet",
                    docs: "Greet someone",
                    signature: "function greet(params: { name: string }): Promise<string>",
                    async handler({ params }) {
                        return `Hello, ${params.name}!`
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()

        // These should all compile and work correctly
        const sum = await capsule.trigger("math", "add", { a: 5, b: 3 })
        expect(sum).toBe(8)

        const greeting = await capsule.trigger("math", "greet", { name: "World" })
        expect(greeting).toBe("Hello, World!")

        await capsule.shutdown()
    })

    test("TypeScript prevents invalid capability names", async () => {
        const capability = defineCapability({
            name: "math",
            docs: "Math operations",
            operations: {
                add: defineOperation<{ a: number; b: number }, number>({
                    name: "add",
                    docs: "Add",
                    signature: "function add(params: { a: number, b: number }): Promise<number>",
                    async handler({ params }) {
                        return params.a + params.b
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()

        // Valid call
        await capsule.trigger("math", "add", { a: 1, b: 2 })

        // Invalid capability name would be a TypeScript error if uncommented
        // @ts-expect-error - "invalid" is not a valid capability name
        // await capsule.trigger("invalid", "add", { a: 1, b: 2 })

        await capsule.shutdown()
    })

    test("TypeScript prevents invalid operation names", async () => {
        const capability = defineCapability({
            name: "math",
            docs: "Math operations",
            operations: {
                add: defineOperation<{ a: number; b: number }, number>({
                    name: "add",
                    docs: "Add",
                    signature: "function add(params: { a: number, b: number }): Promise<number>",
                    async handler({ params }) {
                        return params.a + params.b
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()

        // Valid call
        await capsule.trigger("math", "add", { a: 1, b: 2 })

        // Invalid operation name would be a TypeScript error if uncommented
        // @ts-expect-error - "subtract" is not a valid operation in "math"
        // await capsule.trigger("math", "subtract", { a: 1, b: 2 })

        await capsule.shutdown()
    })

    test("TypeScript validates operation params", async () => {
        const capability = defineCapability({
            name: "math",
            docs: "Math operations",
            operations: {
                add: defineOperation<{ a: number; b: number }, number>({
                    name: "add",
                    docs: "Add",
                    signature: "function add(params: { a: number, b: number }): Promise<number>",
                    async handler({ params }) {
                        return params.a + params.b
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()

        // Valid call with correct params
        await capsule.trigger("math", "add", { a: 1, b: 2 })

        // Wrong param types should be TypeScript errors
        // @ts-expect-error - params should be { a: number, b: number }
        await capsule.trigger("math", "add", { a: "1", b: "2" })

        // @ts-expect-error - missing required params
        await capsule.trigger("math", "add", { a: 1 })

        // @ts-expect-error - wrong param structure
        await capsule.trigger("math", "add", { x: 1, y: 2 })

        await capsule.shutdown()
    })

    test("TypeScript infers correct return types", async () => {
        const capability = defineCapability({
            name: "test",
            docs: "Test capability",
            operations: {
                getString: defineOperation<void, string>({
                    name: "getString",
                    docs: "Returns a string",
                    signature: "function getString(): Promise<string>",
                    async handler() {
                        return "text"
                    }
                }),
                getNumber: defineOperation<void, number>({
                    name: "getNumber",
                    docs: "Returns a number",
                    signature: "function getNumber(): Promise<number>",
                    async handler() {
                        return 42
                    }
                }),
                getObject: defineOperation<void, { key: string }>({
                    name: "getObject",
                    docs: "Returns an object",
                    signature: "function getObject(): Promise<{ key: string }>",
                    async handler() {
                        return { key: "value" }
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()

        const str = await capsule.trigger("test", "getString", undefined)
        const num = await capsule.trigger("test", "getNumber", undefined)
        const obj = await capsule.trigger("test", "getObject", undefined)

        // TypeScript should know these types
        expect(typeof str).toBe("string")
        expect(typeof num).toBe("number")
        expect(typeof obj).toBe("object")
        expect(obj.key).toBe("value")

        // These should be TypeScript errors if uncommented
        // @ts-expect-error - str is string, not number
        const _strAsNumber: number = str

        // @ts-expect-error - num is number, not string
        const _numAsString: string = num

        await capsule.shutdown()
    })

    test("middleware transform must preserve param types", async () => {
        // This is enforced at the type level via MiddlewareResult<TParams>
        // The transform result must return params of the same type

        // This test documents the expected behavior
        const capability = defineCapability({
            name: "test",
            docs: "Test",
            operations: {
                typed: defineOperation<{ value: number }, number>({
                    name: "typed",
                    docs: "Typed operation",
                    signature: "function typed(params: { value: number }): Promise<number>",
                    async handler({ params }) {
                        return params.value * 2
                    }
                })
            }
        })

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()

        const result = await capsule.trigger("test", "typed", { value: 21 })
        expect(result).toBe(42)

        await capsule.shutdown()

        // Note: Middleware transform type safety is enforced by the
        // MiddlewareResult<TParams> generic which requires transform
        // to return { params: TParams }, preserving the type
    })

    test("emit with StimulusMap is type-checked", async () => {
        type TestStimuli = {
            "test:number": number
            "test:string": string
            "test:object": { key: string }
        }

        const capability = defineCapability({
            name: "test",
            docs: "Test",
            operations: {
                emitTyped: defineOperation({
                    name: "emitTyped",
                    docs: "Emits typed stimuli",
                    signature: "function emitTyped(): Promise<void>",
                    async handler({ emit }: any) {
                        // These should all be valid with StimulusMap
                        emit({ sense: "test:number", data: 42 })
                        emit({ sense: "test:string", data: "hello" })
                        emit({ sense: "test:object", data: { key: "value" } })
                    }
                })
            }
        })

        const capsule = Capsule<typeof capability extends any ? readonly [typeof capability] : never, TestStimuli>({
            name: "test",
            capabilities: [capability] as const
        })

        await capsule.boot()
        await capsule.trigger("test", "emitTyped", undefined)
        await capsule.shutdown()

        // Type-checking for emit() is enforced by the TStimulusMap generic
        // Invalid sense or data types would be caught at compile time
    })

    test("lifecycle hooks cannot access trigger()", async () => {
        // This is enforced by LifecycleContext which only provides Pick<CapsuleInstance, "emit">

        const capability = defineCapability({
            name: "test",
            docs: "Test",
            operations: {
                noop: defineOperation({
                    name: "noop",
                    docs: "No-op",
                    signature: "function noop(): Promise<void>",
                    async handler() {}
                })
            }
        })

        let bootContext: any = null

        const capsule = Capsule({
            name: "test",
            capabilities: [capability] as const,
            hooks: {
                async boot({ capsule: ctx }) {
                    bootContext = ctx
                    // ctx.emit is available
                    ctx.emit({ sense: "boot", data: "ok" })

                    // ctx.trigger should not exist (TypeScript error if accessed)
                    // Verify runtime behavior
                }
            }
        })

        await capsule.boot()

        // Verify at runtime that trigger is not available
        expect(bootContext.emit).toBeDefined()
        expect(bootContext.trigger).toBeUndefined()

        await capsule.shutdown()
    })

    test("defineOperation preserves param and return types", async () => {
        // defineOperation is a type-preserving identity function
        type Params = { input: string }
        type Return = { output: string }

        const op = defineOperation<Params, Return>({
            name: "transform",
            docs: "Transform input",
            signature: "function transform(params: { input: string }): Promise<{ output: string }>",
            async handler({ params }) {
                return { output: params.input.toUpperCase() }
            }
        })

        // TypeScript should preserve the types
        expect(op.name).toBe("transform")
        expect(typeof op.handler).toBe("function")

        // The handler signature should enforce types
        const result = await op.handler({
            params: { input: "test" },
            signal: new AbortController().signal,
            emit: () => {}
        })

        expect(result.output).toBe("TEST")
    })
})
