import { randomUUIDv7 } from "bun"
import type { CapsuleProcess, CapsuleSpawnOptions } from "../defineCapsule"
import type { SessionManager } from "../sessions"

/**
 * Factory for repl spawner
 *
 * Returns a function that spawns a Node REPL process in a given session.
 */
export function createReplSpawner(sessionMgr: SessionManager) {
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
            terminal: subprocess.terminal,
        }

        // Attach process to session
        sessionMgr.attachProcess(sessionId, capsuleProcess)

        return capsuleProcess
    }
}