import { test, expect } from "bun:test"
import { buntime } from "../runtime"

async function readLine(proc: Awaited<ReturnType<typeof buntime>>["proc"]) {
    const reader = proc.stdout.getReader()
    const { value } = await reader.read()
    reader.releaseLock()
    return new TextDecoder().decode(value).trim()
}

test("ts command: eval simple expression", async () => {
    const rt = await buntime()

    await rt.command({ type: "ts", code: "1 + 1" })

    const stdout = await readLine(rt.proc)
    console.log("stdout:", stdout)

    const parsed = JSON.parse(stdout)
    expect(parsed.ok).toBe(true)
    expect(parsed.result).toBe(2)

    rt.proc.kill()
})

test("ts command: access global hello()", async () => {
    const rt = await buntime()

    await rt.command({ type: "ts", code: "hello()" })

    const stdout = await readLine(rt.proc)
    console.log("stdout:", stdout)

    const parsed = JSON.parse(stdout)
    expect(parsed.ok).toBe(true)
    expect(parsed.result).toBe("Hello from Bun!")

    rt.proc.kill()
})

test("sanity: greet(name) global", async () => {
    const rt = await buntime()

    await rt.command({ type: "ts", code: "greet('World')" })

    const stdout = await readLine(rt.proc)
    console.log("stdout:", stdout)

    expect(JSON.parse(stdout).ok).toBe(true)

    rt.proc.kill()
})

test("sanity: add(a, b) global", async () => {
    const rt = await buntime()

    await rt.command({ type: "ts", code: "add(3, 7)" })

    const stdout = await readLine(rt.proc)
    console.log("stdout:", stdout)

    expect(JSON.parse(stdout).ok).toBe(true)

    rt.proc.kill()
})

test("sanity: bad code does not crash the runtime", async () => {
    const rt = await buntime()

    await rt.command({ type: "ts", code: "thisDoesNotExist()" })

    const stderr = await (async () => {
        const reader = rt.proc.stderr.getReader()
        const { value } = await reader.read()
        reader.releaseLock()
        return new TextDecoder().decode(value).trim()
    })()

    console.log("stderr:", stderr)

    expect(JSON.parse(stderr).ok).toBe(false)

    rt.proc.kill()
})
