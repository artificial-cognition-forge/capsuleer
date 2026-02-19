import { test, expect } from "bun:test"
import { defineCapsule, Capsule } from "../../defineCapsule"

async function readStdout(capsule: Awaited<ReturnType<typeof Capsule>>) {
    const reader = capsule.proc.stdout.getReader()
    const decoder = new TextDecoder()
    while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const line = decoder.decode(value).trim()
        try {
            const parsed = JSON.parse(line)
            reader.releaseLock()
            return parsed
        } catch {
            // not JSON, keep reading
        }
    }
    reader.releaseLock()
}

test("Capsule boots with a live proc", async () => {
    const cap = await Capsule(defineCapsule({ name: "test" }))

    expect(cap.proc).toBeDefined()
    expect(cap.proc.pid).toBeGreaterThan(0)

    await cap.shutdown()
})

test("Capsule runs a ts command and returns stdout", async () => {
    const cap = await Capsule(defineCapsule({ name: "test" }))

    await cap.command({ type: "ts", code: "40 + 2" })

    const result = await readStdout(cap)
    console.log("stdout:", result)

    expect(result.ok).toBe(true)
    expect(result.result).toBe(42)

    await cap.shutdown()
})

test("Capsule runs a shell command and returns stdout", async () => {
    const cap = await Capsule(defineCapsule({ name: "test" }))

    await cap.command({ type: "shell", command: "echo hello" })

    const result = await readStdout(cap)
    console.log("stdout:", result)

    expect(result.ok).toBe(true)
    expect(result.result).toContain("hello")

    await cap.shutdown()
})

test("Capsule shutdown kills the proc", async () => {
    const cap = await Capsule(defineCapsule({ name: "test" }))

    await cap.shutdown()

    const exitCode = await cap.proc.exited
    expect(exitCode).toBeDefined()
})
