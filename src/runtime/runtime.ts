import { spawn } from "node:child_process"

type BuntimeOpts = {
    cwd?: string
    env?: Record<string, string>
    /** Absolute path to the environment entrypoint. Defaults to bundled environment/index.ts */
    entrypoint?: string
}

export type BuntimeCommand =
    | { type: "ts"; code: string }
    | { type: "shell"; command: string }

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

    return {
        proc,

        async command(command: BuntimeCommand) {
            await new Promise<void>((resolve, reject) => {
                proc.stdin.write(JSON.stringify(command) + "\n", (err) => {
                    if (err) reject(err)
                    else resolve()
                })
            })
        },
    }
}
