import type { CapsuleBlueprint } from "cli/src/capsule/defineCapsule"
import { Client, type ClientChannel } from "ssh2"

type ConnectionOptions = {
    host: string
    port: number
    username: string
    privateKey?: string
    agent?: string
}

/** 
 * Capsule Client
 * 
 * Connect to a remote capsule server and manage processes
 * programmatically.
 */
export function CapsuleClient() {
    const client = new Client()
    let rpcStream: ClientChannel | null = null

    if (rpcStream) {
        return rpcStream
    }

    return {
        async connect(opts: ConnectionOptions) {
            return new Promise(async (resolve, reject) => {
                client.on("ready", () => {
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
                console.log("AGENT", process.env.SSH_AUTH_SOCK)

                client.connect({
                    host: opts.host,
                    port: opts.port,
                    username: opts.username,
                    debug: console.log,
                    // privateKey: await Bun.file("~/.ssh/id_ed25519").text(),
                    agent: process.env.SSH_AUTH_SOCK,
                    // tryKeyboard: false,
                    agentForward: true,
                })
            })

        },

        /** Spawn a remote process. */
        async spawn(opts: SpawnOptions): Promise<CapsuleProcess> {
            // spawn a remote process
            // return a CapsuleProcess
        },

        async disconnect() {
            // disconnect via ssh
        },

        async on() { },

        /** Remote capsule informnation */
        capsules: {
            /** List available capsules */
            async list(): CapsuleBlueprint[] {

            },
            async attach(): Promise<CapsuleProcess> { },
        }
    }
}

type SpawnOptions = {
    runtime: "shell" | "bun"
    capsule: string
    endpoint: string
}
type RpcEnvelope =
    | RpcRequest
    | RpcEvent
    | RpcResponse

type RpcRequest = {
    kind: "request"
    id: string
    method: string
    params?: any
}

type RpcResponse = {
    kind: "response"
    id: string
    result?: any
    error?: any
}

type RpcEvent = {
    kind: "event"
    topic: string
    processId?: string
    payload?: any
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

    kill: () => Promise<void>
    detach: () => Promise<void>
    on: (event: string, callback: (code: number) => void) => void

    exit: Promise<{ code: number, signal?: string }>

    status(): Promise<{
        running: boolean
        code?: number
        signal?: string
        command: string[]
    }>
}

export async function main() {
    const client = CapsuleClient()

    await client.connect({
        host: "127.0.0.1",
        port: 22,
        username: "cody",
        agent: process.env.SSH_AUTH_SOCK,
    })

    const proc = await client.spawn({
        capsule: "default",
        endpoint: "shell",
        runtime: "shell",
    })

    for await (const chunk of proc.stdout) {
        console.log(chunk.toString())
    }

    for await (const chunk of proc.stderr) {
        console.error(chunk.toString())
    }

    proc.stdin("echo hello world\n")

}

main()