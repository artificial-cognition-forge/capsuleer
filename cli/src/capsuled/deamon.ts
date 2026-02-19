import { storage } from "../storage/storage"
import { trace } from "./trace"
import { randomUUIDv7, spawn } from "bun"
import { join } from "path"
import { checkHealth, type CapsuleerDeamonStatus } from "../commands/health"
import type { CapsuleerEvent } from "../types/events"
import { daemonInstanceId } from "./utils/daemonInstanceId"
import { CapsuleerWebsocket } from "../transport/ws"
import { Capsule, defineCapsule } from "capsule/defineCapsule"

const capsuleBlueprint = defineCapsule({
    name: "default",
})

/** Capsuleer Daemon */
export const daemon = {
    capsule: await Capsule(capsuleBlueprint),

    /** Capsuleer Daemon runtime. (blocking - for systemd/launchd) */
    async runtime() {
        const daemonInstanceId = randomUUIDv7()
        process.env.CAPSULEER_DAEMON_INSTANCE_ID = daemonInstanceId

        const log = trace()
        await daemon.capsule.boot()

        // boot WS server
        const ws = CapsuleerWebsocket(daemon.capsule)
        await ws.boot()

        // emit startup event
        log.append({
            type: "daemon.started",
            version: "0.1.0",
        })

        // ensure installed
        await daemon.install()

        // Write capsuleer authorized keys to SSH's authorized_keys file
        // const sshKeysPath = join(homedir(), ".ssh", "authorized_keys")
        // writeAuthorizedKeysFile(sshKeysPath)

        // The SSH server continues handling requests in the background
        // Block forever until signal (Ctrl+C or systemd stop)
        const handleShutdown = async () => {
            await ws.shutdown()
            await daemon.down()
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
        const scriptsDir = join(import.meta.dirname, "../scripts")
        const startScript = join(scriptsDir, "daemon/start.sh")

        // Spawn the daemon in background
        spawn({
            cmd: ["bash", startScript],
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
            env: process.env
        })
    },

    /** Stop daemon and return immediately */
    async down() {
        const t = trace()
        const scriptsDir = join(import.meta.dirname, "../scripts")
        const stopScript = join(scriptsDir, "daemon/stop.sh")
        const instanceId = daemonInstanceId

        await daemon.capsule.shutdown()

        // Spawn the daemon in background
        spawn({
            cmd: ["bash", stopScript],
            stdio: ["ignore", "ignore", "ignore"],
        })

        // t.append({
        //     type: "daemon.stopped",
        //     reason: "signal",
        // }, { instanceId })
    },

    /** Restart the Capsuleer Deamon */
    async restart() {
        await daemon.down()
        await daemon.up()
    },

    /** Emit an event to the daemon log. */
    async emit(event: CapsuleerEvent) {
        const t = trace()
        t.append(event)
    },

    /** Get the current status of the Capsuleer Deamon */
    async health(): Promise<CapsuleerDeamonStatus> {
        return await checkHealth()
    },


    /** Write ctl script to disk */
    install: storage.capsuled.install,
    uninstall: storage.capsuled.uninstall,
}