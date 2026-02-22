import { capsule } from "./capsule"
import { help } from "./commands/help"
import { repl } from "./commands/repl"

export const cli = {
    capsule: capsule,
    help: help,
    repl: repl,
}