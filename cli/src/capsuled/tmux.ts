import { spawn, type Subprocess } from "bun";
import { getTrace } from "./traceContext";
import config from "cli/config";

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

type TmuxConfigType = "full" | "locked" | "bun";

export const tmux = {
    /**
     * Execute a tmux command and return the output
     */
    async exec(args: string[]): Promise<string> {
        const proc = spawn(["tmux", ...args], {
            stdio: ["ignore", "pipe", "pipe"],
        })

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
    },

    /**
     * Spawn a long-running tmux process (new session, attach, etc)
     */
    async spawn(args: string[]): Promise<Subprocess<"inherit", "pipe", "pipe">> {
        return spawn(["tmux", ...args], {
            stdio: ["inherit", "pipe", "pipe"],
        })
    },

    /** Manage the capsuleer tmux server */
    server: {
        /**
         * Start the tmux server (if not already running)
         */
        async start() {
            try {
                // check if tmux server is alive
                await tmux.exec(["ls"]);
                getTrace().push({
                    type: "tmux.server.started",
                    serverId: "capsuleerd-tmux",
                });
            } catch (err) {
                // if tmux server is not running, start a dummy session
                // using -d to detach immediately
                await tmux.exec(["new-session", "-d", "-s", "capsuleerd_server"]);
                getTrace().push({
                    type: "tmux.server.started",
                    serverId: "capsuleerd-tmux",
                });
            }
        },

        /**
         * Stop the tmux server entirely (kills all sessions)
         */
        async stop() {
            try {
                await tmux.exec(["kill-server"]);
                getTrace().push({
                    type: "tmux.server.stopped",
                    serverId: "default",
                });
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
                const output = await tmux.exec([
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
            options: {
                windowName?: string
                cwd?: string
                detached?: boolean
                command?: string | string[]
                tmux?: TmuxConfigType
            } = {}
        ): Promise<void> {
            const args = ["new-session", "-d", "-s", name];

            const config = options.tmux ? tmux.config[options.tmux] : tmux.config.locked

            if (options.windowName) {
                args.push("-n", options.windowName);
            }

            if (options.detached) {
                args.push("-d");
            }

            if (options.cwd) {
                args.push("-c", options.cwd);
            }

            // ✅ Append command if provided
            if (options.command) {
                if (Array.isArray(options.command)) {
                    args.push(...options.command);
                } else {
                    args.push(options.command);
                }
            }

            try {

                await tmux.exec(args);
            } catch {
                // ignore if alareyd exists
            }

            await config(name) // apply tmux config

            getTrace().push({
                type: "tmux.session.created",
                serverId: "default",
                session: name,
            });
        },

        /**
         * Kill a session by name
         */
        async kill(name: string): Promise<void> {
            await tmux.exec(["kill-session", "-t", name]);
            getTrace().push({
                type: "tmux.session.killed",
                serverId: "default",
                session: name,
            });
        },

        /**
         * Kill all sessions
         */
        async killAll(): Promise<void> {
            await tmux.exec(["kill-server"]);
        },

        /**
         * Check if a session exists
         */
        async has(name: string): Promise<boolean> {
            try {
                await tmux.exec(["has-session", "-t", name]);
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
            await tmux.exec(["rename-session", "-t", oldName, newName]);
        },

        /**
         * Attach to a session (spawns interactive process)
         */
        async attach(name: string, options: { configFile?: string } = {}): Promise<number> {
            const cmd = ["tmux"];

            // If a config file is provided, use it
            if (options.configFile) {
                console.log(options.configFile)
                cmd.push("-f", options.configFile);
            }

            cmd.push("attach", "-t", name);

            const proc = spawn({
                cmd,
                stdio: ["inherit", "inherit", "inherit"],
            })

            // await tmuxProc.exited;
            return await proc.exited
        },
    },

    window: {
        /**
         * Attach to a window in a session (spawns interactive process)
         */
        async attach(
            session: string,
            window: string | number,
            options: { tmux?: keyof typeof tmux.config } = {}
        ): Promise<number> {
            const target =
                typeof window === "number" ? `${session}:${window}` : `${session}:${window}`;
            const cmd = ["tmux"];

            const config = options.tmux ? tmux.config[options.tmux] : tmux.config.locked

            cmd.push("attach", "-t", target);

            await config(target) // setup tmux config

            const proc = spawn({
                cmd,
                stdio: ["inherit", "inherit", "inherit"],
            })

            return await proc.exited
        },

        /**
         * List windows in a session
         */
        async list(session: string): Promise<WindowInfo[]> {
            const output = await tmux.exec([
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
        async create(
            session: string,
            name?: string,
            options: { command?: string | string[]; index?: number } = {}
        ): Promise<string> {
            const args = ["new-window", "-t", session];
            if (options.index !== undefined) {
                args.push("-t", `${session}:${options.index}`);
                // Remove the previous -t session entry
                args.splice(1, 2);
            }
            if (name) {
                args.push("-n", name);
            }
            // Append command if provided
            if (options.command) {
                if (Array.isArray(options.command)) {
                    args.push(...options.command);
                } else {
                    args.push(options.command);
                }
            }

            try {
                return await tmux.exec(args);
            } catch (error) {
                console.log("tmux.window.create failed", error)
                // ignore if alareyd exists
            }

            return ""
        },

        /**
         * Kill a window
         */
        async kill(session: string, window: string | number): Promise<void> {
            const target =
                typeof window === "number" ? `${session}:${window}` : `${session}:${window}`;
            await tmux.exec(["kill-window", "-t", target]);
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
            await tmux.exec(["rename-window", "-t", target, newName]);
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
            await tmux.exec(args);
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
            await tmux.exec(args);
        },
    },

    pane: {
        /**
         * Get the process ID running in a pane
         */
        async getPID(target: string): Promise<number> {
            const output = await tmux.exec([
                "list-panes",
                "-t",
                target,
                "-F",
                "#{pane_pid}",
            ])
            const pidStr = output.trim()
            if (!pidStr) {
                throw new Error(`Cannot determine PID for pane ${target}`)
            }
            const pid = parseInt(pidStr, 10)
            if (isNaN(pid)) {
                throw new Error(`Invalid PID for pane ${target}: ${pidStr}`)
            }
            return pid
        },

        /**
         * List panes in a window
         */
        async list(session: string, window: string | number): Promise<PaneInfo[]> {
            const target =
                typeof window === "number" ? `${session}:${window}` : `${session}:${window}`;
            const output = await tmux.exec([
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
            enter: boolean = true,
            literal: boolean = false
        ): Promise<void> {
            const args = ["send-keys", "-t", target];
            // -l flag: interpret as literal UTF-8 keys, not special sequences (like C-c)
            if (literal) {
                args.push("-l");
            }
            args.push(keys);
            if (enter) {
                args.push("Enter");
            }
            await tmux.exec(args);
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
            return tmux.exec(args);
        },

        /**
         * Resize a pane
         */
        async resize(target: string, width: number, height: number): Promise<void> {
            await tmux.exec([
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
            await tmux.exec(["select-pane", "-t", target]);
        },
    },

    /**
     * Get the version of tmux
     */
    async version(): Promise<string> {
        return tmux.exec(["-V"]);
    },

    config: {
        /** Full tmux config. (admin) */
        async full(session: string, window: string) {
            return // no changes
        },

        /**
         * Locked tmux config.
         *
         * This simulates a single shell environment.
         * Removing all the tmux features.
         */
        async locked(session: string, window: string) {
            const target = `${session}:${window}`

            await tmux.exec(["set-option", "-t", target, "status", "off"]);
            await tmux.exec(["set-option", "-t", target, "prefix", "None"]);
        },

        /** 
         * Tmux config for bun REPL. 
         * 
         * Prevents killing the bun repl. The user can only detach.
         */
        async bun(session: string, window: string) {
            const target = `${session}:${window}`

            // Optional: keep status bar on and custom prefix
            await tmux.exec(["set-option", "-t", target, "status", "on"]);
            await tmux.exec(["set-option", "-t", target, "prefix", "bun"]);

            // Drop bun REPL into the specific window
            await tmux.exec([
                "send-keys",
                "-t",
                target,
                "bun repl",
                "C-m",
            ])
        }

    }
}
export default tmux;
