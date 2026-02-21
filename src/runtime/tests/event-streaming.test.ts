import { test, expect } from "bun:test"
import { buntime } from "../runtime"

test("onEvent: receive JSONL events from ts command", async () => {
    const rt = await buntime()

    const events: any[] = []

    // Subscribe to events
    const unsubscribe = rt.onEvent((event) => {
        events.push(event)
    })

    // Execute command
    const commandId = await rt.command({
        type: "ts",
        code: "console.log('Hello'); 1 + 1"
    })

    // Wait a bit for events to arrive
    await new Promise(resolve => setTimeout(resolve, 500))

    // Verify we got the expected events
    expect(events.length).toBeGreaterThan(0)

    // Find the exit event
    const exitEvent = events.find(e => e.event === "exit" && e.id === commandId)
    expect(exitEvent).toBeDefined()
    expect(exitEvent.ok).toBe(true)
    expect(exitEvent.result).toBe(2)

    // Find stdout event with console.log
    const stdoutEvent = events.find(e => e.event === "stdout" && e.id === commandId)
    expect(stdoutEvent).toBeDefined()
    expect(stdoutEvent.data).toBe("Hello")

    // Cleanup
    unsubscribe()
    rt.proc.kill()
})

test("onEvent: unsubscribe stops receiving events", async () => {
    const rt = await buntime()

    const events: any[] = []

    // Subscribe and immediately unsubscribe
    const unsubscribe = rt.onEvent((event) => {
        events.push(event)
    })
    unsubscribe()

    // Execute command
    await rt.command({ type: "ts", code: "1 + 1" })

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500))

    // Should not receive any events
    expect(events.length).toBe(0)

    rt.proc.kill()
})

test("onEvent: shell command emits events", async () => {
    const rt = await buntime()

    const events: any[] = []

    rt.onEvent((event) => {
        events.push(event)
    })

    const commandId = await rt.command({
        type: "shell",
        code: "echo 'test output'"
    })

    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 500))

    // Find exit event
    const exitEvent = events.find(e => e.event === "exit" && e.id === commandId)
    expect(exitEvent).toBeDefined()
    expect(exitEvent.ok).toBe(true)
    expect(exitEvent.result).toContain("test output")

    rt.proc.kill()
})
