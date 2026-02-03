import { storage } from "../storage/storage"
import tmux from "./tmux"
import { CapsuleManager } from "./capsule-manager"
import { trace, type CapsuleerTrace } from "./trace"
import { setTraceContext, clearTraceContext, getTrace } from "./traceContext"
import { randomUUIDv7, spawn } from "bun"
import { ssh } from "../ingress/ssh/ssh"

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
    capsuleManager: CapsuleManager
    trace: CapsuleerTrace
}

export const daemon = {
    /** Start the Capsuleer Deamon (blocking - for systemd/launchd) */
    async start() {
        const daemonInstanceId = randomUUIDv7()
        const log = trace()
        const manager = await CapsuleManager()

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

        // start ssh server and wait for it to be ready
        await ssh().start()

        return ctx
    },

    /** Start daemon in background and return immediately */
    async up() {
        // First check if daemon is already running
        const health = await daemon.health()
        if (health.healthy) {
            console.log("Daemon is already running")
            return
        }

        // Write a simple shell script to daemonize properly
        const { writeFileSync } = await import("fs")
        const { tmpdir, homedir } = await import("os")
        const { join } = await import("path")

        const logsDir = join(homedir(), ".capsuleer", "logs")
        const { mkdirSync } = await import("fs")
        try {
            mkdirSync(logsDir, { recursive: true })
        } catch (e) {
            // ignore
        }

        const logFile = join(logsDir, "daemon.log")
        const scriptPath = join(tmpdir(), `capsuleer-daemon-${Date.now()}.sh`)
        const script = `#!/bin/bash
exec nohup capsuleer daemon start >> ${logFile} 2>&1 &
`
        writeFileSync(scriptPath, script)

        // Spawn the shell script
        const proc = spawn({
            cmd: ["bash", scriptPath],
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
        })

        // Unref so this process doesn't wait
        proc.unref()

        console.log("Daemon started in background (logs at " + logFile + ")")

        // Give it a moment to start up
        await new Promise(resolve => setTimeout(resolve, 1500))
    },

    /** Stop daemon in background and return immediately */
    async down() {
        // Check if daemon is running
        const health = await daemon.health()
        if (!health.running) {
            console.log("Daemon is not running")
            return
        }

        // Kill the daemon process by finding the process listening on port 2222
        const proc = spawn({
            cmd: ["bash", "-c", "lsof -ti :2222 | xargs kill -TERM 2>/dev/null || true"],
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

        await tmux.server.stop()
        clearTraceContext()
    },

    /** Restart the Capsuleer Deamon */
    async restart() {
        await daemon.stop()
        await daemon.start()
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

    /** Write ctl script to disk */
    install: storage.capsuled.install,
    uninstall: storage.capsuled.uninstall,
}