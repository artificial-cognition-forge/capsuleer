import { storage } from "../storage/storage"
import { writeAuthorizedKeysFile } from "../storage/keys"
import { CapsuleManager, type CapsuleManagerInstance } from "./capsule-manager"
import { trace, type CapsuleerTrace } from "./trace"
import { setTraceContext, clearTraceContext, getTrace } from "./traceContext"
import { randomUUIDv7, spawn } from "bun"
import { homedir } from "os"
import { join } from "path"
import { checkHealth, type CapsuleerDeamonStatus } from "../commands/health"
import { parseCapsuleUrl } from "./utils/parseCapsuleUrl"

type CapsuleerRuntimeCtx = {
    daemonInstanceId: string
    capsuleManager: CapsuleManagerInstance
    trace: CapsuleerTrace
}


/** Capsuleer Daemon */
export const daemon = {
    /** Capsuleer Daemon runtime. (blocking - for systemd/launchd) */
    async runtime() {
        process.title = "capsuleerd"
        console.log("DAEMON ENV", process.env)
        const daemonInstanceId = randomUUIDv7()
        const log = trace()
        const manager = await CapsuleManager()
        // Set global trace context for all modules

        setTraceContext(log, daemonInstanceId)

        // Save daemon PID for later cleanup

        // emit startup event
        log.push({
            type: "daemon.started",
            version: "0.1.0",
        })

        // ensure installed
        await daemon.install()

        // Write capsuleer authorized keys to SSH's authorized_keys file
        const sshKeysPath = join(homedir(), ".ssh", "authorized_keys")
        writeAuthorizedKeysFile(sshKeysPath)

        // start tmux
        // await tmux.server.start()

        // start all capsules
        await manager.start()

        // The SSH server continues handling requests in the background
        // Block forever until signal (Ctrl+C or systemd stop)
        const handleShutdown = async () => {
            console.log("\nShutting down gracefully...")
            await daemon.stop()
            process.exit(0)
        }

        process.on('SIGTERM', handleShutdown)
        process.on('SIGINT', handleShutdown)

        // Block forever using Bun's sleep with a very large timeout
        // This avoids the Bun event loop bug with empty Promise executors
        await Bun.sleep(Number.MAX_SAFE_INTEGER)
    },

    /** Start daemon in background and return immediately */
    async up() {
        process.title = "capsuleerd"
        const logsDir = join(homedir(), ".capsuleer", "logs")
        const logFile = join(logsDir, "daemon.log")
        const scriptsDir = join(import.meta.dirname, "../scripts")
        const startScript = join(scriptsDir, "daemon/start.sh")


        // Spawn the daemon in background
        spawn({
            cmd: ["bash", startScript, logFile],
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
            env: process.env
        })

        console.log("Daemon started in background (logs at " + logFile + ")")
    },

    /** Stop daemon and return immediately */
    async down() {
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
            // await tmux.exec(["kill-server"])
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
        return await checkHealth()
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
            const connection = parseCapsuleUrl(connString)
            return await manager.attach(connection)
        },
    },

    /** 
     * Remote Procedure Call 
     * 
     * for machine use of the capsuleer cli
     */
    rpc: {
        /** 
         * Capsuleer RPC
         * 
         * Full control over the capsuleer cli over SSH.
         */
        async stdio() {
        }
    },

    /** Write ctl script to disk */
    install: storage.capsuled.install,
    uninstall: storage.capsuled.uninstall,
}