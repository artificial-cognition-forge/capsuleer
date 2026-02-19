import { daemon } from "./capsuled/deamon"
import { help } from "./commands/help"
import { tail } from "./commands/tail"

export const cli = {
    daemon: daemon,

    /** Start the daemon. */
    start: daemon.runtime,

    /** Start daemon in background (non-blocking) */
    up: daemon.up,

    /** Stop daemon in background (non-blocking) */
    down: daemon.down,

    /** Check daemon health. */
    health: daemon.health, // currntly broken

    /** Tail the capsuleer daemon log. */
    tail: tail,

    /** Log the help command. */
    help: help,
}