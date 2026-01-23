/**
 * PTY STREAM TESTS
 *
 * Test stream operations for interactive shell access over SSH.
 * Verifies basic PTY allocation, data streaming, and lifecycle management.
 *
 * NOTE: These tests require:
 * - node-pty to be installed: npm install node-pty
 * - A running SSH server for RemoteCapsuleInstance tests (or mock)
 */

import { describe, test, expect } from "bun:test"
import { LocalCapsuleInstance } from "../index.ts"
import type { CapsuleDef, OperationDef, StreamOperationHandler } from "../types/mod.ts"

/**
 * Test shell capsule with stream operations
 */
type ShellDef = CapsuleDef<
    readonly [
        {
            name: "shell"
            docs: "Interactive shell operations"
            operations: {
                echo: OperationDef<{ message: string }, string>
                streamLines: OperationDef<{ count: number }, string>
            }
        }
    ]
>

const shellDef: ShellDef = {
    name: "test-shell",
    docs: "Test shell capsule",
    capabilities: [
        {
            name: "shell",
            docs: "Shell operations",
            operations: {
                echo: {
                    name: "echo",
                    docs: "Echo a message (normal operation)",
                    signature: "(message: string) => string",
                    handler: async (ctx) => {
                        return `Echo: ${ctx.params.message}`
                    }
                },
                streamLines: {
                    name: "streamLines",
                    docs: "Stream N lines (stream operation)",
                    signature: "(count: number) => AsyncIterable<string>",
                    kind: "stream",
                    handler: (async function* (ctx) {
                        for (let i = 0; i < ctx.params.count; i++) {
                            if (ctx.signal.aborted) {
                                break
                            }
                            yield `Line ${i + 1} of ${ctx.params.count}`
                            // Small delay to simulate I/O
                            await new Promise((r) => setTimeout(r, 10))
                        }
                    }) as StreamOperationHandler<{ count: number }, string>
                }
            }
        }
    ]
}

describe("Stream Operations", () => {
    test("local capsule supports stream operations", async () => {
        const instance = LocalCapsuleInstance(shellDef)
        await instance.boot()

        // Trigger a stream operation
        const stream = await instance.trigger("shell", "streamLines", { count: 3 })

        // Collect all data
        const lines: string[] = []
        for await (const line of stream) {
            lines.push(line)
        }

        // Verify all lines received
        expect(lines.length).toBe(3)
        expect(lines[0]).toContain("Line 1 of 3")
        expect(lines[1]).toContain("Line 2 of 3")
        expect(lines[2]).toContain("Line 3 of 3")

        await instance.shutdown()
    })

    test("stream operation respects abort signal", async () => {
        const instance = LocalCapsuleInstance(shellDef)
        await instance.boot()

        const controller = new AbortController()

        // Trigger stream with abort signal
        const stream = await instance.trigger("shell", "streamLines", { count: 100 }, controller.signal)

        const lines: string[] = []
        const iterator = stream[Symbol.asyncIterator]()

        // Read first line
        const first = await iterator.next()
        expect(first.done).toBe(false)
        lines.push(first.value)

        // Abort mid-stream
        controller.abort()

        // Try to read more - should stop
        const next = await iterator.next()
        expect(next.done).toBe(true)

        expect(lines.length).toBe(1)

        await instance.shutdown()
    })

    test("normal operations still work alongside streams", async () => {
        const instance = LocalCapsuleInstance(shellDef)
        await instance.boot()

        // Trigger normal operation
        const result = await instance.trigger("shell", "echo", { message: "hello world" })
        expect(result).toBe("Echo: hello world")

        // Trigger stream operation
        const stream = await instance.trigger("shell", "streamLines", { count: 2 })
        const lines: string[] = []
        for await (const line of stream) {
            lines.push(line)
        }
        expect(lines.length).toBe(2)

        // Normal operation again
        const result2 = await instance.trigger("shell", "echo", { message: "goodbye" })
        expect(result2).toBe("Echo: goodbye")

        await instance.shutdown()
    })

    test("multiple stream operations can run sequentially", async () => {
        const instance = LocalCapsuleInstance(shellDef)
        await instance.boot()

        // First stream
        const stream1 = await instance.trigger("shell", "streamLines", { count: 2 })
        const lines1: string[] = []
        for await (const line of stream1) {
            lines1.push(line)
        }

        // Second stream
        const stream2 = await instance.trigger("shell", "streamLines", { count: 3 })
        const lines2: string[] = []
        for await (const line of stream2) {
            lines2.push(line)
        }

        expect(lines1.length).toBe(2)
        expect(lines2.length).toBe(3)

        await instance.shutdown()
    })

    test("stream with zero items terminates cleanly", async () => {
        const instance = LocalCapsuleInstance(shellDef)
        await instance.boot()

        const stream = await instance.trigger("shell", "streamLines", { count: 0 })

        const lines: string[] = []
        for await (const line of stream) {
            lines.push(line)
        }

        expect(lines.length).toBe(0)

        await instance.shutdown()
    })

    test("capsule lifecycle with streams", async () => {
        const instance = LocalCapsuleInstance(shellDef)

        // Can't trigger before boot
        try {
            await instance.trigger("shell", "streamLines", { count: 1 })
            expect.fail("Should not reach here")
        } catch (e: any) {
            expect(e.message).toContain("Cannot trigger operations")
        }

        await instance.boot()

        // Trigger should work after boot
        const stream = await instance.trigger("shell", "streamLines", { count: 1 })
        const lines: string[] = []
        for await (const line of stream) {
            lines.push(line)
        }
        expect(lines.length).toBe(1)

        await instance.shutdown()

        // Can't trigger after shutdown
        try {
            await instance.trigger("shell", "streamLines", { count: 1 })
            expect.fail("Should not reach here")
        } catch (e: any) {
            expect(e.message).toContain("Cannot trigger operations")
        }
    })
})

describe("Remote PTY Operations (requires node-pty and SSH)", () => {
    // These tests are placeholders - in practice, they would:
    // 1. Start an SSH server
    // 2. Deploy the shell capsule to the remote
    // 3. Test streaming over SSH
    //
    // For now, they serve as documentation of the expected API

    test.skip("remote PTY streaming over SSH", async () => {
        // const instance = RemoteCapsuleInstance(shellDef, sshConfig, "shell")
        // await instance.boot()
        //
        // const stream = await instance.trigger("shell", "streamLines", { count: 5 })
        // const lines: string[] = []
        // for await (const line of stream) {
        //     lines.push(line)
        // }
        //
        // expect(lines.length).toBe(5)
        // await instance.shutdown()
    })

    test.skip("remote PTY shell streaming", async () => {
        // const instance = RemoteCapsuleInstance(shellDef, sshConfig, "shell")
        // await instance.boot()
        //
        // // Stream output from actual shell command
        // const stream = await instance.trigger("shell", "streamPTY", {
        //     command: "/bin/bash",
        //     args: ["-c", "echo 'Line 1'; echo 'Line 2'; echo 'Line 3'"]
        // })
        //
        // const output: string[] = []
        // for await (const chunk of stream) {
        //     output.push(chunk.toString())
        // }
        //
        // const combined = output.join("")
        // expect(combined).toContain("Line 1")
        // expect(combined).toContain("Line 2")
        // expect(combined).toContain("Line 3")
        //
        // await instance.shutdown()
    })
})
