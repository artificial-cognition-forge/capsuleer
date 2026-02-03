import { storage } from "../storage/storage"
import tmux from "./tmux"
import { CapsuleManager, type CapsuleManagerInstance } from "./capsule-manager"
import { trace, type CapsuleerTrace } from "./trace"
import { setTraceContext, clearTraceContext, getTrace } from "./traceContext"
import { randomUUIDv7, spawn } from "bun"
import { ssh } from "../ingress/ssh/ssh"
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
        const server = ssh()

        // Set global trace context for all modules
        setTraceContext(log, daemonInstanceId)

        const ctx: CapsuleerRuntimeCtx = {
            daemonInstanceId,
            capsuleManager: manager,
            trace: log,
        }

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

        // start ssh server and wait for it to be ready
        await server.start()

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
    },

    /** Start daemon in background and return immediately */
    async up() {
        // Check if SSH is already running on port 2424
        const sshHealth = await ssh().health()
        if (sshHealth.status === "running") {
            console.log("Daemon is already running on port " + sshHealth.port)
            return
        }

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

        // Unref so this process doesn't wait
        proc.unref()

        console.log("Daemon started in background (logs at " + logFile + ")")
    },

    /** Stop daemon in background and return immediately */
    async down() {
        // Check if SSH is running
        const sshHealth = await ssh().health()
        if (sshHealth.status !== "running") {
            console.log("Daemon is not running")
            return
        }

        const scriptsDir = join(import.meta.dirname, "../scripts")
        const stopScript = join(scriptsDir, "daemon/stop.sh")

        // Spawn the stop script with port argument
        const proc = spawn({
            cmd: ["bash", stopScript, "2424"],
            detached: true,
        })

        proc.unref()

        console.log("Stopping daemon...")

        // Give it a moment to stop
        await new Promise(resolve => setTimeout(resolve, 500))
    },

    /** Stop the Capsuleer Deamon */
    async stop() {
        const log = getTrace()

        log.push({
            type: "daemon.stopped",
            reason: "signal",
        })

        await ssh().stop()
        await tmux.server.stop()
        clearTraceContext()
    },

    /** Restart the Capsuleer Deamon */
    async restart() {
        await daemon.stop()
        await daemon.runtime()
    },

    /** Get the current status of the Capsuleer Deamon */
    async health(): Promise<CapsuleerDeamonStatus> {
        try {
            // Get SSH server health
            const sshHealth = await ssh().health()

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
        // hook up with the manager
        async list() {
            const manager = await CapsuleManager()
            return await manager.list()
        },

        /** Attach to a capsule via SSH. */
        async attach(url: string, options: CapsuleAttachOptions) {
            // 
        },
    },

    /** Write ctl script to disk */
    install: storage.capsuled.install,
    uninstall: storage.capsuled.uninstall,
}