import { daemon } from "./capsuled/deamon"
import { auth } from "./ingress/auth"
import { help } from "./help"
import { tail } from "./commands/tail"

export const cli = {
    daemon: daemon,

    /** Stop the daemon. */
    stop: daemon.stop,

    /** Start the daemon. */
    start: daemon.start,

    /** Start daemon in background (non-blocking) */
    up: daemon.up,

    /** Stop daemon in background (non-blocking) */
    down: daemon.down,

    /** Check daemon health. */
    health: daemon.health,

    /** Manage capsules. */
    capsule: {
        /** List all remote capsules. */
        async list() { },

        /** 
         * Connect to a remote capsule. 
         * 
         * modes: "shell" | "bun"
         * 
         * **Shell**
         * A default shell instance.
         * 
         * **Bun**
         * Bun will load you into a sandboxed ts environment
         * loaded with the capsule's capabilities.
         */
        async connect() { },

    },
    /** Authenticate with remote capsules. */
    auth: auth,

    /** Tail the capsuleer daemon log. */
    tail: tail,

    /** Log the help command. */
    help: help,
}