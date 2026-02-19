type BuntimeOpts = {
    cwd?: string
    env?: Record<string, string>
}

type BuntimeCommand =
    | { type: "ts";    code: string }
    | { type: "shell"; command: string }

/**
 * Capsuleer Buntime
 * 
 * This spawns a bun subproces and allows typescript
 * or shell execution.
 */
export async function buntime(opts: BuntimeOpts = {}) {
    const proc = Bun.spawn({
        cmd: ["bun", "run", import.meta.dir + "/environment/index.ts"],
        cwd: opts.cwd,
        env: opts.env,
        stdio: ["pipe", "pipe", "pipe"],
    })

    return {
        proc: proc,

        // Send command to proc
        async command(command: BuntimeCommand) {
            await proc.stdin.write(JSON.stringify(command) + "\n")
            await proc.stdin.flush()
        }
    }
}