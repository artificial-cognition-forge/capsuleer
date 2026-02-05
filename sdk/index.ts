export function CapsuleClient() {
    return {
        async connect() {
            // connect via ssh
        },

        /** Spawn a remote process. */
        async spawn(opts: SpawnOptions): Promise<CapsuleProcess> {
            // spawn a remote process
            // return a CapsuleProcess
        },

        async disconnect() {
            // disconnect via ssh
        },
    }
}

type SpawnOptions = {

}

type CapsuleProcess = {
    id: string
    runtime: "shell" | "bun"

    address: {
        name: string
        endpoint: string
        host: string
        port: number
    }

    stdout: AsyncIterable<Uint8Array>
    stderr: AsyncIterable<Uint8Array>
    stdin: (data: string | Uint8Array) => Promise<void>

    kill: () => Promise<void>
    on: (event: string, callback: (code: number) => void) => void

    exit: Promise<{ code: number, signal?: string }>

    status(): Promise<{
        running: boolean
        code?: number
        signal?: string
        command: string[]
    }>
}