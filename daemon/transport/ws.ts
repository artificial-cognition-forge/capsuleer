import type { CapsuleInstance } from "../capsule/defineCapsule"
import { CognosClient } from "@cognos/ws"
import type { Server } from "bun"

type WsEvent =
    | { type: "stdout"; data: string }
    | { type: "stderr"; data: string }
    | { type: "stdin"; data: string }

/** A websocket server for exposing a shell api and ts api. */
export function CapsuleerWebsocket(capsule: CapsuleInstance, port = 3011) {
    const clients = new Set<import("bun").ServerWebSocket<unknown>>()
    const events: WsEvent[] = []

    function broadcast(event: WsEvent) {
        events.push(event)
        const msg = JSON.stringify(event)
        for (const client of clients) {
            client.send(msg)
        }
    }

    async function pipeStream(stream: ReadableStream, type: "stdout" | "stderr") {
        const reader = stream.getReader()
        const decoder = new TextDecoder()
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            broadcast({ type, data: decoder.decode(value) })
        }
    }

    let server: Server<any> | null = null

    return {
        capsule,

        async boot() {
            // Start piping proc streams into broadcast
            pipeStream(capsule.proc.stdout, "stdout")
            pipeStream(capsule.proc.stderr, "stderr")

            server = Bun.serve({
                port,
                websocket: {
                    open(ws) {
                        // Replay history then subscribe to live events
                        for (const event of events) {
                            ws.send(JSON.stringify(event))
                        }
                        clients.add(ws)
                    },

                    async message(ws, raw) {
                        const cmd = JSON.parse(String(raw))
                        const echo: WsEvent = { type: "stdin", data: String(raw) }
                        broadcast(echo)
                        await capsule.command(cmd)
                    },

                    close(ws) {
                        clients.delete(ws)
                    },
                },
                fetch(req, server) {
                    server.upgrade(req)
                    return new Response(null, { status: 101 })
                },
            })
        },

        async shutdown() {
            server?.stop()
            server = null
            clients.clear()
        },
    }
}
