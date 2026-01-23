/**
 * PTY Handler for stream operations
 *
 * Spawns a pseudo-terminal using node-pty and yields output data chunks.
 * Integrates with the Capsule operation execution context.
 */

import type { OperationExecutionContext } from "../types/operation.ts"

export interface PTYParams {
    /** Shell command to run */
    command: string
    /** Arguments to pass to shell */
    args?: string[]
    /** Terminal width (columns) */
    cols?: number
    /** Terminal height (rows) */
    rows?: number
    /** Environment variables to set */
    env?: Record<string, string>
    /** Working directory */
    cwd?: string
}

/**
 * Stream handler for PTY operations
 * Yields Buffer chunks of PTY output
 */
export async function* ptyStreamHandler(
    ctx: OperationExecutionContext & { params: PTYParams }
): AsyncIterable<Buffer> {
    // Dynamic import to handle optional dependency
    let pty: any
    try {
        pty = await import("node-pty")
    } catch (e) {
        throw new Error("node-pty is required for PTY operations. Install with: npm install node-pty")
    }

    const params = ctx.params
    const signal = ctx.signal

    // Validate params
    if (!params.command) {
        throw new Error("PTY command is required")
    }

    // Spawn PTY process
    const shell = pty.spawn(params.command, params.args || [], {
        name: "xterm-256color",
        cols: params.cols || 80,
        rows: params.rows || 24,
        cwd: params.cwd || process.cwd(),
        env: { ...process.env, ...params.env }
    })

    try {
        // Helper to read all pending data from PTY
        // Returns a promise that resolves when data arrives or signal aborts
        async function readData(): Promise<Buffer | null> {
            return new Promise((resolve) => {
                // If signal is already aborted, return immediately
                if (signal.aborted) {
                    resolve(null)
                    return
                }

                // Listen for data
                const dataHandler = (chunk: Buffer) => {
                    shell.removeListener("data", dataHandler)
                    signal.removeEventListener("abort", abortHandler)
                    resolve(chunk)
                }

                // Listen for abort
                const abortHandler = () => {
                    shell.removeListener("data", dataHandler)
                    signal.removeEventListener("abort", abortHandler)
                    resolve(null)
                }

                shell.on("data", dataHandler)
                signal.addEventListener("abort", abortHandler, { once: true })
            })
        }

        // Yield data until PTY closes or signal aborts
        while (!signal.aborted) {
            const chunk = await readData()

            if (chunk === null) {
                // Signal was aborted
                break
            }

            yield chunk
        }
    } finally {
        // Always kill the PTY process
        try {
            shell.kill()
        } catch (e) {
            // Already dead, ignore
        }
    }
}
