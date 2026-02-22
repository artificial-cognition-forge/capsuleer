import { test, expect } from "bun:test"
import { defineCapsule, Capsule } from "../../defineCapsule"
import { CapsuleerWebsocket } from "../../../transport/ws"

const PORT = 3099

async function setup() {
    const capsule = await Capsule(defineCapsule({ name: "default" }))
    const ws = CapsuleerWebsocket(capsule, PORT)
    await ws.boot()
    return { capsule, ws }
}

function connect(): Promise<{ socket: WebSocket; messages: string[]; waitFor: (n: number) => Promise<void> }> {
    return new Promise((resolve) => {
        const socket = new WebSocket(`ws://localhost:${PORT}`)
        const messages: string[] = []

        socket.onmessage = (e) => messages.push(e.data)

        socket.onopen = () => {
            resolve({
                socket,
                messages,
                waitFor(n: number) {
                    return new Promise((res) => {
                        const check = setInterval(() => {
                            if (messages.length >= n) {
                                clearInterval(check)
                                res()
                            }
                        }, 10)
                    })
                },
            })
        }
    })
}

test("client receives stdout after sending a ts command", async () => {
    const { ws } = await setup()
    const client = await connect()

    client.socket.send(JSON.stringify({ type: "ts", code: "1 + 1" }))

    // expect stdin echo + stdout response
    await client.waitFor(2)

    console.log("messages:", client.messages)

    const stdin = JSON.parse(client.messages[0]!)
    const stdout = JSON.parse(client.messages[1]!)

    expect(stdin.type).toBe("stdin")
    expect(stdout.type).toBe("stdout")
    expect(stdout.data).toContain('"result":2')

    client.socket.close()
    await ws.shutdown()
})

test("late-joining client receives event history", async () => {
    const { ws } = await setup()

    // first client sends a command
    const first = await connect()
    first.socket.send(JSON.stringify({ type: "ts", code: "hello()" }))
    await first.waitFor(2)
    first.socket.close()

    // second client connects after - should get history replayed
    const second = await connect()
    await second.waitFor(2)

    console.log("replayed messages:", second.messages)

    const types = second.messages.map((m) => JSON.parse(m).type)
    expect(types).toContain("stdin")
    expect(types).toContain("stdout")

    second.socket.close()
    await ws.shutdown()
})
