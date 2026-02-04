import { storage } from "../storage/storage"
import tmux from "./tmux"
import { CapsuleManager, type CapsuleManagerInstance } from "./capsule-manager"
import { trace, type CapsuleerTrace } from "./trace"
import { setTraceContext, clearTraceContext, getTrace } from "./traceContext"
import { randomUUIDv7, spawn } from "bun"
import { homedir } from "os"
import { join } from "path"

type SSHStatus = {
    status: string
    port: number
    clients: number
}

type CapsuleerDeamonStatus = {
    running: boolean
    healthy: boolean
    ssh: SSHStatus
}

type CapsuleerRuntimeCtx = {
    daemonInstanceId: string
    capsuleManager: CapsuleManagerInstance
    trace: CapsuleerTrace
}

const CAPSULE_CONNECT_STRING_FORMAT = "user@host:port/capsule-name"

/** Capsuleer Daemon */
export const daemon = {
    /** Capsuleer Daemon runtime. (blocking - for systemd/launchd) */
    async runtime() {

        const daemonInstanceId = randomUUIDv7()
        const log = trace()
        const manager = await CapsuleManager()
        // Set global trace context for all modules

        setTraceContext(log, daemonInstanceId)

        // Save daemon PID for later cleanup
        await storage.pidManager.savePID(process.pid)

        // emit startup event
        log.push({
            type: "daemon.started",
            version: "0.1.0",
        })

        // ensure installed
        await daemon.install()

        // start tmux
        await tmux.server.start()

        // start all capsules
        await manager.start()

        // The SSH server continues handling requests in the background
        // Block forever until signal (Ctrl+C or systemd stop)
        await new Promise<void>((resolve) => {
            const handleShutdown = async () => {
                console.log("\nShutting down gracefully...")
                await daemon.stop()
                resolve()
            }

            process.on('SIGTERM', handleShutdown)
            process.on('SIGINT', handleShutdown)
        })
        return
    },

    /** Start daemon in background and return immediately */
    async up() {
        const logsDir = join(homedir(), ".capsuleer", "logs")
        const logFile = join(logsDir, "daemon.log")
        const scriptsDir = join(import.meta.dirname, "../scripts")
        const startScript = join(scriptsDir, "daemon/start.sh")

        // Spawn the start script with log file argument
        const proc = spawn({
            cmd: ["bash", startScript, logFile],
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
        })

        // proc.unref()

        // Wait for the script to start the daemon and exit
        // const exitCode = await proc.exited

        // if (exitCode !== 0) {
        //     const stderr = await new Response(proc.stderr).text()
        //     throw new Error(`Failed to start daemon: ${stderr}`)
        // }

        // Give the daemon a moment to fully initialize
        // await new Promise(resolve => setTimeout(resolve, 500))

        console.log("Daemon started in background (logs at " + logFile + ")")
    },

    /** Stop daemon and return immediately */
    async down() {
        await storage.pidManager.killDaemon()
        console.log("Daemon stopped")
    },

    /** Stop the Capsuleer Deamon */
    async stop() {
        const log = getTrace()

        if (log) {
            log.push({
                type: "daemon.stopped",
                reason: "signal",
            })
        }


        // Kill tmux server with force to ensure all sessions are terminated
        try {
            await tmux.exec(["kill-server"])
        } catch (err) {
            // Silently ignore if server doesn't exist - this is normal
        }

        clearTraceContext()
    },

    /** Restart the Capsuleer Deamon */
    async restart() {
        const log = trace()
        const daemonInstanceId = randomUUIDv7()
        setTraceContext(log, daemonInstanceId)

        await daemon.stop()
        await daemon.up()

        clearTraceContext()
    },

    /** Get the current status of the Capsuleer Deamon */
    async health(): Promise<CapsuleerDeamonStatus> {
        try {
            // Get SSH server health
            // we now need another way to check the health of the server
            const sshHealth = await ssh().health() // we no longer use our own ssh server

            // Tmux server is running if we can list sessions
            const sessions = await tmux.session.list()
            const running = sessions.length > 0

            // Only check session if server is running
            const hasSession = running ? await tmux.session.has("capsuleerd_server") : false

            const res = {
                running: running && sshHealth.status === "running",
                healthy: running && hasSession && sshHealth.status === "running",
                ssh: sshHealth,
            }

            console.log(res)

            return res
        } catch (error) {
            // If we can't reach services, daemon is not running
            const res = {
                running: false,
                healthy: false,
                ssh: {
                    status: "unknown",
                    port: 0,
                    clients: 0,
                },
            }

            console.log(res)
            return res
        }
    },

    /** Daemon capsules */
    capsules: {
        /** List all local capsules. */
        async list() {
            const manager = await CapsuleManager()
            const capsules = await manager.list()
            if (capsules.length === 0) {
                console.log("No capsules running")
                return
            }
            console.log(`Capsules (${capsules.length}):`)
            for (const capsule of capsules) {
                console.log(`  - ${capsule.blueprint.name}`)
            }
        },

        /** 
         * Capsuleer Attach
         * 
         * Attach to a running capsule process.
         * 
         * Usage:
         * 
         * **Local**
         * ```ts
         *"capsuleer attach <capsule-name>"
         * ```
         * 
         * **Remote**
         * ```ts
         *"capsuleer attach <host>:<port>/<capsule-name>"
         * ```
         */
        async attach(connString: string) {
            const manager = await CapsuleManager()

            return await manager.attach(connString, {
                interface: "shell",
            })
        },
    },

    /** Write ctl script to disk */
    install: storage.capsuled.install,
    uninstall: storage.capsuled.uninstall,
}