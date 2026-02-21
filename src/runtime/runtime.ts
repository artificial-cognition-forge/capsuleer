import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import type { CapsuleerRuntimeEvent } from "./environment/setup"

type BuntimeOpts = {
    cwd?: string
    env?: Record<string, string>
    /** Absolute path to the environment entrypoint. Defaults to bundled environment/index.ts */
    entrypoint?: string
}

export type BuntimeCommand =
    | { id: string; type: "ts" | "shell"; code: string; stream?: boolean }

/** Default entrypoint - only correct when not bundled (i.e. running under Bun directly) */
const DEFAULT_ENTRYPOINT = new URL("./environment/index.ts", import.meta.url).pathname

/**
 * Capsuleer Buntime
 *
 * Spawns a bun subprocess using node:child_process so it works
 * in both Node (Nuxt/Nitro dev) and Bun runtimes.
 */
export async function buntime(opts: BuntimeOpts = {}) {
    const entrypoint = opts.entrypoint ?? DEFAULT_ENTRYPOINT

    const proc = spawn("bun", ["run", entrypoint], {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        stdio: ["pipe", "pipe", "pipe"],
    })

    // Keep process alive - unref allows parent to exit but proc keeps running
    proc.stdout.setEncoding("utf8")

    // Event listeners registry - weak so they can be garbage collected
    const eventListeners = new Set<(event: CapsuleerRuntimeEvent) => void>()

    // Buffer for incomplete JSONL lines
    let stdoutBuffer = ""

    // Parse JSONL output from the subprocess
    proc.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk

        // Process all complete lines (separated by newlines)
        const lines = stdoutBuffer.split("\n")
        // Keep the last incomplete line in the buffer
        stdoutBuffer = lines.pop() || ""

        for (const line of lines) {
            if (!line.trim()) continue // Skip empty lines

            try {
                const event = JSON.parse(line) as CapsuleerRuntimeEvent
                for (const listener of eventListeners) {
                    listener(event)
                }
            } catch (err) {
                console.error("[buntime] Failed to parse JSONL:", line, err)
            }
        }
    })

    proc.stderr.on("data", (chunk: string) => {
        console.error("[buntime stderr]", chunk.toString())
    })

    return {
        proc,

        async command(cmd: Omit<BuntimeCommand, "id" | "stream"> & { stream?: boolean }) {
            const command: BuntimeCommand = {
                id: randomUUID(),
                stream: cmd.stream ?? true,
                ...cmd,
            }

            await new Promise<void>((resolve, reject) => {
                proc.stdin.write(JSON.stringify(command) + "\n", (err) => {
                    if (err) reject(err)
                    else resolve()
                })
            })

            return command.id
        },

        /**
         * Subscribe to events from the subprocess.
         * Returns an unsubscribe function.
         */
        onEvent(listener: (event: CapsuleerRuntimeEvent) => void): () => void {
            eventListeners.add(listener)
            return () => eventListeners.delete(listener)
        },
    }
}
