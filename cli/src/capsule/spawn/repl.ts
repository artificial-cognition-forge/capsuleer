import { randomUUIDv7 } from "bun"
import type { CapsuleProcess, CapsuleSpawnOptions } from "../defineCapsule"
import type { SessionManager } from "../sessions"
import { join } from "path"
import { execSync } from "child_process"
import { homedir } from "os"

/**
 * Find the node executable
 */
function findNodeExecutable(): string {
    try {
        // Try which command first
        const which = execSync("which node", { encoding: "utf-8" }).trim()
        if (which) return which
    } catch {
        // Fall back to NVM path
        const nvmDir = process.env.NVM_DIR || join(homedir(), ".nvm")
        const nvmNode = join(nvmDir, "versions/node/*/bin/node")
        try {
            const result = execSync(`ls -d ${nvmNode} 2>/dev/null | tail -1`, {
                encoding: "utf-8",
            }).trim()
            if (result) return result
        } catch {
            // Ignore
        }
    }
    // Default to node (will error if not found)
    return "node"
}

/**
 * Factory for repl spawner
 *
 * Returns a function that spawns a Node REPL process in a given session.
 */
export function createReplSpawner(sessionMgr: SessionManager) {
    return async (sessionId: string, opts: CapsuleSpawnOptions): Promise<CapsuleProcess> => {
        // Validate session exists and is active
        sessionMgr.validate(sessionId)

        // Path to the node-repl.cjs script
        const replScript = join(import.meta.dirname, 'node-repl.cjs')
        const nodeExecutable = findNodeExecutable()

        const subprocess = Bun.spawn([nodeExecutable, replScript], {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
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
            stdin: subprocess.stdin,
            stdout: subprocess.stdout,
            stderr: subprocess.stderr,
            exited: subprocess.exited,
            exitCode: subprocess.exitCode,
            signalDescription: (subprocess as any).signalDescription,
            kill: subprocess.kill.bind(subprocess),
            terminal: undefined,
        } as any

        // Attach process to session
        sessionMgr.attachProcess(sessionId, capsuleProcess)

        return capsuleProcess
    }
}