import { spawn, type Subprocess } from "bun";

export interface TmuxError extends Error {
    code: number;
    stderr: string;
}

function isTmuxError(error: unknown): error is TmuxError {
    return (
        error instanceof Error &&
        "code" in error &&
        "stderr" in error &&
        typeof (error as any).code === "number"
    );
}

/**
 * Execute a tmux command and return the output
 */
async function exec(args: string[]): Promise<string> {
    const proc = spawn(["tmux", ...args], {
        stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        const error = new Error(`tmux command failed: ${args.join(" ")}`) as TmuxError;
        error.code = exitCode;
        error.stderr = stderr;
        throw error;
    }

    return stdout.trim();
}

/**
 * Spawn a long-running tmux process (new session, attach, etc)
 */
function spawnProcess(args: string[]): Subprocess<"inherit", "pipe", "pipe"> {
    return spawn(["tmux", ...args], {
        stdio: ["inherit", "pipe", "pipe"],
    });
}

interface SessionInfo {
    name: string;
    windowCount: number;
    createdAt: number;
}

interface WindowInfo {
    id: string;
    name: string;
    active: boolean;
    paneCount: number;
}

interface PaneInfo {
    id: string;
    index: number;
    active: boolean;
    width: number;
    height: number;
    pid: number | null;
}

export const tmux = {
    /** Manage the capsuleer tmux server */
    server: {
        /**
         * Start the tmux server (if not already running)
         */
        async start() {
            try {
                // check if tmux server is alive
                await exec(["tmux", "ls"]);
            } catch (err) {
                // if tmux server is not running, start a dummy session
                // using -d to detach immediately
                await exec(["tmux", "new-session", "-d", "-s", "capsuleerd_server"]);
            }
        },

        /**
         * Stop the tmux server entirely (kills all sessions)
         */
        async stop() {
            try {
                await exec(["tmux", "kill-server"]);
            } catch (err) {
                // if server is already down, ignore
            }
        },
    },

    session: {
        /**
         * List all active sessions
         */
        async list(): Promise<SessionInfo[]> {
            try {
                const output = await exec([
                    "list-sessions",
                    "-F",
                    "#{session_name}|#{session_windows}|#{session_created}",
                ]);
                if (!output) return [];

                return output.split("\n").map((line) => {
                    const [name, windowCount, createdAt] = line.split("|");
                    return {
                        name: name!,
                        windowCount: parseInt(windowCount!, 10),
                        createdAt: parseInt(createdAt!, 10),
                    };
                });
            } catch (error) {
                if (isTmuxError(error) && error.stderr.includes("no server running")) {
                    return [];
                }
                throw error;
            }
        },

        /**
         * Create a new session
         */
        async create(
            name: string,
            options: { windowName?: string; cwd?: string } = {}
        ): Promise<void> {
            const args = ["new-session", "-d", "-s", name];
            if (options.windowName) {
                args.push("-n", options.windowName);
            }
            if (options.cwd) {
                args.push("-c", options.cwd);
            }
            await exec(args);
        },

        /**
         * Kill a session by name
         */
        async kill(name: string): Promise<void> {
            await exec(["kill-session", "-t", name]);
        },

        /**
         * Kill all sessions
         */
        async killAll(): Promise<void> {
            await exec(["kill-server"]);
        },

        /**
         * Check if a session exists
         */
        async has(name: string): Promise<boolean> {
            try {
                await exec(["has-session", "-t", name]);
                return true;
            } catch {
                return false;
            }
        },

        /**
         * Get session info
         */
        async get(name: string): Promise<SessionInfo | null> {
            const sessions = await this.list();
            return sessions.find((s) => s.name === name) || null;
        },

        /**
         * Rename a session
         */
        async rename(oldName: string, newName: string): Promise<void> {
            await exec(["rename-session", "-t", oldName, newName]);
        },

        /**
         * Attach to a session (spawns interactive process)
         */
        attach(name: string): void {
            spawnProcess(["attach-session", "-t", name]);
        },
    },

    window: {
        /**
         * List windows in a session
         */
        async list(session: string): Promise<WindowInfo[]> {
            const output = await exec([
                "list-windows",
                "-t",
                session,
                "-F",
                "#{window_id}|#{window_name}|#{window_active}|#{window_panes}",
            ]);
            if (!output) return [];

            return output.split("\n").map((line) => {
                const [id, name, active, paneCount] = line.split("|");
                return {
                    id: id!,
                    name: name!,
                    active: active === "1",
                    paneCount: parseInt(paneCount!, 10),
                };
            });
        },

        /**
         * Create a new window in a session
         */
        async create(session: string, name?: string): Promise<string> {
            const args = ["new-window", "-t", session];
            if (name) {
                args.push("-n", name);
            }
            return exec(args);
        },

        /**
         * Kill a window
         */
        async kill(session: string, window: string | number): Promise<void> {
            const target =
                typeof window === "number" ? `${session}:${window}` : `${session}:${window}`;
            await exec(["kill-window", "-t", target]);
        },

        /**
         * Rename a window
         */
        async rename(
            session: string,
            window: string | number,
            newName: string
        ): Promise<void> {
            const target =
                typeof window === "number" ? `${session}:${window}` : `${session}:${window}`;
            await exec(["rename-window", "-t", target, newName]);
        },

        /**
         * Split a window vertically
         */
        async splitVertical(
            session: string,
            window: string | number,
            options: { percentage?: number } = {}
        ): Promise<void> {
            const target =
                typeof window === "number" ? `${session}:${window}` : `${session}:${window}`;
            const args = ["split-window", "-v", "-t", target];
            if (options.percentage) {
                args.push("-p", options.percentage.toString());
            }
            await exec(args);
        },

        /**
         * Split a window horizontally
         */
        async splitHorizontal(
            session: string,
            window: string | number,
            options: { percentage?: number } = {}
        ): Promise<void> {
            const target =
                typeof window === "number" ? `${session}:${window}` : `${session}:${window}`;
            const args = ["split-window", "-h", "-t", target];
            if (options.percentage) {
                args.push("-p", options.percentage.toString());
            }
            await exec(args);
        },
    },

    pane: {
        /**
         * List panes in a window
         */
        async list(session: string, window: string | number): Promise<PaneInfo[]> {
            const target =
                typeof window === "number" ? `${session}:${window}` : `${session}:${window}`;
            const output = await exec([
                "list-panes",
                "-t",
                target,
                "-F",
                "#{pane_id}|#{pane_index}|#{pane_active}|#{pane_width}|#{pane_height}|#{pane_pid}",
            ]);
            if (!output) return [];

            return output.split("\n").map((line) => {
                const [id, index, active, width, height, pid] = line.split("|");
                return {
                    id: id!,
                    index: parseInt(index!, 10),
                    active: active === "1",
                    width: parseInt(width!, 10),
                    height: parseInt(height!, 10),
                    pid: pid ? parseInt(pid, 10) : null,
                };
            });
        },

        /**
         * Send keys to a pane
         */
        async sendKeys(
            target: string,
            keys: string,
            enter: boolean = true
        ): Promise<void> {
            const args = ["send-keys", "-t", target, keys];
            if (enter) {
                args.push("Enter");
            }
            await exec(args);
        },

        /**
         * Send raw keys to a pane (no Enter)
         */
        async sendRawKeys(target: string, keys: string): Promise<void> {
            await this.sendKeys(target, keys, false);
        },

        /**
         * Run a command in a pane
         */
        async run(target: string, command: string): Promise<void> {
            await this.sendKeys(target, command, true);
        },

        /**
         * Get output from a pane
         */
        async capture(
            target: string,
            options: { startLine?: number; endLine?: number } = {}
        ): Promise<string> {
            const args = ["capture-pane", "-t", target, "-p"];
            if (options.startLine !== undefined) {
                args.push("-S", options.startLine.toString());
            }
            if (options.endLine !== undefined) {
                args.push("-E", options.endLine.toString());
            }
            return exec(args);
        },

        /**
         * Resize a pane
         */
        async resize(target: string, width: number, height: number): Promise<void> {
            await exec([
                "resize-pane",
                "-t",
                target,
                "-x",
                width.toString(),
                "-y",
                height.toString(),
            ]);
        },

        /**
         * Select a pane
         */
        async select(target: string): Promise<void> {
            await exec(["select-pane", "-t", target]);
        },
    },

    /**
     * Get the version of tmux
     */
    async version(): Promise<string> {
        return exec(["-V"]);
    },

    /**
     * Execute a raw tmux command
     */
    async raw(args: string[]): Promise<string> {
        return exec(args);
    },
};

export default tmux;
