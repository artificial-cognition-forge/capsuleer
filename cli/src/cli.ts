import { daemon } from "./capsuled/deamon"
import { auth } from "./ingress/auth"
import { help } from "./help"
import { tail } from "./commands/tail"
import { attachCommand } from "./commands/attach"
import { CapsuleManager } from "./capsuled/capsule-manager"

export const cli = {
    daemon: daemon,

    /** Stop the daemon. */
    stop: daemon.stop,

    /** Start the daemon. */
    start: daemon.runtime,

    /** Start daemon in background (non-blocking) */
    up: daemon.up,

    /** Stop daemon in background (non-blocking) */
    down: daemon.down,

    /** Check daemon health. */
    health: daemon.health,

    /** Manage local capsules. */
    capsule: {
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

        /** Attach to a capsule via SSH. */
        async attach(connString: string, options?: { key?: string }) {
            await attachCommand(connString, options)
        },
    },

    /** Authenticate with remote capsules. */
    auth: auth,

    /** Tail the capsuleer daemon log. */
    tail: tail,

    /** Log the help command. */
    help: help,
}