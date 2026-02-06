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

        let terminal: Bun.Terminal | undefined;

        if (opts.pty) {
            terminal = new Bun.Terminal({
                cols: process.stdout.columns,
                rows: process.stdout.rows,
                data: (_term, data) => Bun.stdout.write(data),
            })
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
            terminal: subprocess.terminal,
        };

        // Attach process to session
        sessionMgr.attachProcess(sessionId, capsuleProcess)

        return capsuleProcess
    }
}