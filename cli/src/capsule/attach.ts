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

        // Forward SIGINT to child process instead of exiting parent
        const sigintHandler = () => {
            proc.kill("SIGINT");
        };
        process.on("SIGINT", sigintHandler);

        // Listen for stdin
        const reader = process.stdin[Symbol.asyncIterator]();

        try {
            // Race: either stdin closes or process exits
            const inputTask = (async () => {
                try {
                    for await (const chunk of reader) {
                        terminal.write(chunk);
                    }
                } catch (e) {
                    // reader canceled
                }
            })();

            // Wait for either stdin to close or process to exit
            await Promise.race([
                inputTask,
                proc.exited
            ]);
        } finally {
            process.removeListener("SIGINT", sigintHandler);
            if (process.stdin.isTTY) process.stdin.setRawMode(false);
            process.stdout.write("\x1b[?1049l"); // back to main screen
        }
    }
}