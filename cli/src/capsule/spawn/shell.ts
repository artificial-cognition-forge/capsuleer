import { randomUUIDv7 } from "bun"
import type { CapsuleProcess, CapsuleSpawnOptions } from "../defineCapsule"
import type { SessionManager } from "../sessions"

/**
 * Factory for shell spawner
 *
 * Returns a function that spawns a shell process in a given session.
 */
export function createShellSpawner(sessionMgr: SessionManager) {
    return async (sessionId: string, opts: CapsuleSpawnOptions): Promise<CapsuleProcess> => {
        // Validate session exists and is active
        sessionMgr.validate(sessionId)

        let spawnOpts: any = {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
        }

        if (opts.pty) {
            const terminal = new Bun.Terminal({
                cols: process.stdout.columns,
                rows: process.stdout.rows,
                data: (_term, data) => Bun.stdout.write(data),
            })
            spawnOpts.terminal = terminal
        }

        // Run bash as a command processor that reads from stdin and outputs to stdout
        // This ensures proper stdout/stderr separation without TTY overhead
        // Using cat to echo back the line, then eval to execute it
        const subprocess = Bun.spawn(
            ["bash", "-c", "while IFS= read -r line; do echo \">> $line\" >&2; eval \"$line\"; done"],
            spawnOpts
        )

        const capsuleProcess: CapsuleProcess = {
            id: randomUUIDv7(),
            runtime: "shell",
            address: {
                endpoint: opts.endpoint,
                host: opts.host,
                name: opts.name,
                port: opts.port || 22,
            },
            // Explicitly copy stream properties (not enumerable in Bun.Subprocess)
            stdin: subprocess.stdin,
            stdout: subprocess.stdout,
            stderr: subprocess.stderr,
            exited: subprocess.exited,
            exitCode: subprocess.exitCode,
            signalDescription: subprocess.signalDescription,
            kill: subprocess.kill.bind(subprocess),
            terminal: subprocess.terminal,
        } as any;

        // Attach process to session
        sessionMgr.attachProcess(sessionId, capsuleProcess)

        return capsuleProcess
    }
}