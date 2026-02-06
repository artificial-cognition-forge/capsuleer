import type { CapsuleBlueprint } from "cli/src/capsule/defineCapsule"
import { Client, type ClientChannel } from "ssh2"

type ConnectionOptions = {
    /** Capsule Name */
    name: string

    /** Capsule Endpoint */
    endpoint: string
}

type CapsuleSession = {
    id: string
    clientId: string

    runtime: "shell" | "bun"
    address: CapsuleAddress

    spawn(opts: SpawnOptions): Promise<CapsuleProcess>
    kill(): void
    send(): void
}

type CapsuleClientOpts = {
    host: string
    port: number
}

/** 
 * Capsule Client
 * 
 * Connect to a remote capsule server and manage processes
 * programmatically.
 */
export function CapsuleClient(clientOpts: CapsuleClientOpts) {
    const { host, port } = clientOpts
    const client = new Client()
    let rpcStream: ClientChannel | null = null

    if (rpcStream) {
        return rpcStream
    }

    return {
        async connect(opts: ConnectionOptions): Promise<CapsuleSession> {
            return new Promise(async (resolve, reject) => {
                client.on("ready", () => {

                    /** explicitly go through the rpc endpoints */
                    client.exec("~/.capsuleer/scripts/capsuleer.sh rpc stdio", (err, stream) => {
                        if (err) {
                            reject(err)
                            return
                        }

                        // Save RPC transport streams for later use
                        rpcStream = stream

                        stream.on("close", () => {
                            // daemon exited or ssh closed
                            // you will likely emit connection lost here later
                        })

                        stream.on("data", (data) => {
                            console.log("[capsuleeer stdout]", data.toString())
                        })

                        stream.stderr.on("data", (data) => {
                            // optional: useful for debugging daemon issues
                            console.error("[capsuleeer stderr]", data.toString())
                        })

                        resolve(0)
                    })

                    client.shell(
                        {
                            term: "xterm-256color",
                            cols: 80,
                            rows: 24,
                        },
                        (err, stream) => {
                            if (err) throw err;

                            stream.on("data", (data) => {
                                process.stdout.write(data);
                            })

                            process.stdin.pipe(stream);
                        }
                    )
                })

                client.on("error", reject)

                client.connect({
                    host: host,
                    port: port,
                    username: "",
                    // debug: console.log,

                    // Auth config
                    agent: process.env.SSH_AUTH_SOCK,
                    agentForward: true,
                })
            })

        },

        /** Remote capsule informnation */
        capsules: {
            /** List available capsules */
            async list(): Promise<CapsuleBlueprint[]> { },
        }
    }
}

type SpawnOptions = {
    runtime: "shell" | "bun"
}

type CapsuleAddress = {
    name: string
    endpoint: string
    host: string
    port: number
}

type CapsuleProcess = {
    id: string
    runtime: "shell" | "bun"

    address: CapsuleAddress

    stdout: AsyncIterable<Uint8Array>
    stderr: AsyncIterable<Uint8Array>
    stdin: (data: string | Uint8Array) => Promise<void>

    /** 
     * Events
     * 
     * Combination of stdout and stderr and stdin
     * 
     * ```ts
     *for await (const evt of proc.events) {
     *    if (evt.kind === "stdout") {}
     *    if (evt.kind === "stderr") {}
     *    if (evt.kind === "exit") {}
     *}
     * ```
     */
    events: AsyncIterable<ProcessEvent>

    /** Detach from the process without killing it. */
    detach: () => Promise<void>

    exited: Promise<{ code: number, signal?: string }>

    status(): Promise<{
        running: boolean
        code?: number
        signal?: string
        command: string[]
    }>
}

export async function main() {
    const client = CapsuleClient({
        host: "127.0.0.1",
        port: 22,
    })

    const sesh = await client.connect({
        name: "default",
        endpoint: "default",
    })

    const proc = await sesh.spawn({
        runtime: "shell",
    })

    proc.stdin("console.log('hello world')")

    for await (const chunk of proc.events) {
        console.log(chunk.toString())
    }

    await proc.exited
}

main()

type ProcessEvent =
    | { type: "stdout", data: Buffer }
    | { type: "stderr", data: Buffer }
    | { type: "exit", code: number }
    | { type: "error", error: any }
    | { type: "lifecycle", state: string }
