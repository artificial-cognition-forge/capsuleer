import { randomUUIDv7 } from "bun"
import { spawn as ptySpawn, type IPty } from "node-pty"

type CapsuleClientMode = "shell" | "bun"

type ProcReg = Record<string, CapsuleProcess>

/**
 * The main Capsule blueprint type
 */
export type CapsuleBlueprint = {
    name: string                   // capsule name
    description?: string
    env: Record<string, string>
    boot: Promise<void>
    shutdown: Promise<void>
    scope: any
}

export type DefineCapsuleInput = {
    name: string
    description?: string

    env?: Record<string, string>
    scope?: any

    /** setup hook */
    boot?: Promise<void>


    /** shutdown hook */
    shutdown?: Promise<void>
}

/**
 * The API: define a capsule blueprint
 */
export type DefineCapsuleFn = (blueprint: CapsuleBlueprint) => CapsuleBlueprint

/** Define capsule */
export function defineCapsule(input: DefineCapsuleInput): CapsuleBlueprint {
    return {
        name: input.name,
        description: input.description,
        env: input.env || {},
        boot: input.boot || Promise.resolve(),
        shutdown: input.shutdown || Promise.resolve(),
        scope: [],
    }
}

type CapsuleState = {
    sessionName: string
    started: boolean
}

type SpawnOptions = {
    name: string
    endpoint: string
    host: string
    port: number
    pty?: boolean
}

/**
 * Capsule
 * 
 * - shell process
 * - bun process
 */
export async function Capsule(blueprint: CapsuleBlueprint) {
    const state: CapsuleState = {
        sessionName: blueprint.name,
        started: false,
    }

    const reg: ProcReg = {}

    return {
        blueprint,

        /** Boot the capsule */
        async start() {
            if (state.started) return

            // start bun repl

            state.started = true
        },

        /** Create a new process in the capsule */
        spawn: {
            async shell(opts: SpawnOptions): Promise<CapsuleProcess> {
                let terminal: Bun.Terminal | undefined;

                if (opts.pty) {
                    terminal = new Bun.Terminal({
                        cols: process.stdout.columns,
                        rows: process.stdout.rows,
                        data: (term, data) => Bun.stdout.write(data),
                    });
                }

                const subprocess = Bun.spawn(["bash"], {
                    terminal,
                })

                const capsuleProcess: CapsuleProcess = {
                    id: randomUUIDv7(),
                    runtime: "shell",
                    address: {
                        endpoint: opts.endpoint,
                        host: opts.host,
                        name: opts.name,
                        port: opts.port || 22,
                    },
                    ...subprocess,
                    terminal: subprocess.terminal, // <-- save the terminal reference here
                };

                reg[opts.endpoint] = capsuleProcess

                return capsuleProcess
            },

            /** Spawn a bun repl process. */
            async bun(opts: SpawnOptions): Promise<CapsuleProcess> {
                let terminal: Bun.Terminal | undefined;

                if (opts.pty) {
                    terminal = new Bun.Terminal({
                        cols: process.stdout.columns,
                        rows: process.stdout.rows,
                        data: (term, data) => Bun.stdout.write(data),
                    })
                }

                const subprocess = Bun.spawn(["node", "-i", "-r", "./test.ts"], {
                    terminal,
                })

                const capsuleProcess: CapsuleProcess = {
                    id: randomUUIDv7(),
                    runtime: "bun",
                    address: {
                        endpoint: opts.endpoint,
                        host: opts.host,
                        name: opts.name,
                        port: opts.port || 22,
                    },
                    ...subprocess,
                    terminal: subprocess.terminal, // <-- save the terminal reference here
                }

                reg[opts.endpoint] = capsuleProcess

                return capsuleProcess
            },
        },

        async list() {
            return Object.values(reg)
        },

        /** Attach to a running capsule using a PTY */
        async attach(endpoint: string) {
            const proc = reg[endpoint]!;
            if (!proc.terminal) throw new Error("Process is not interactive");

            const terminal = proc.terminal;

            // Forward input
            if (process.stdin.isTTY) process.stdin.setRawMode(true);
            process.stdin.resume();

            process.stdout.write("\x1b[?1049h"); // switch to alternate screen

            // Listen for SIGINT manually
            const reader = process.stdin[Symbol.asyncIterator]();

            try {
                for await (const chunk of reader) {
                    const str = new TextDecoder().decode(chunk);

                    // Detect Ctrl+C
                    if (str === "\x03") { // ASCII 3 = Ctrl+C
                        proc.kill("SIGINT"); // send SIGINT to the subprocess
                        continue; // don’t forward Ctrl+C to terminal.write
                    }

                    terminal.write(str);
                }
            } catch (e) {
                // reader canceled
            } finally {
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                process.stdout.write("\x1b[?1049l"); // back to main screen
            }

            await proc.exited;
        },

        /** Shutdown the capsule*/
        async stop() {
            if (!state.started) return

            state.started = false
        },

    }
}

export type CapsuleInstance = Awaited<ReturnType<typeof Capsule>>

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
} & Bun.Subprocess