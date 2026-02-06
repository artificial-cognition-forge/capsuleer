import type { SessionManager } from "./sessions"

/**
 * Factory for attach handler
 *
 * Returns a function that attaches to a running process in a session using a PTY.
 */
export function createAttachHandler(sessionMgr: SessionManager) {
    return async (sessionId: string, processId: string): Promise<void> => {
        // Validate session exists and is active
        const session = sessionMgr.validate(sessionId)

        const proc = session.procs.get(processId)
        if (!proc) {
            throw new Error(`Process not found in session: ${processId}`)
        }

        if (!proc.terminal) {
            throw new Error("Process is not interactive")
        }

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
                    continue; // don't forward Ctrl+C to terminal.write
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
    }
}