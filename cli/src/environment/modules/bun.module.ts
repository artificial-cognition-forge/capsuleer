import { $ as bunShell, file as bunFile, write as bunWrite, fetch as bunFetch } from "bun"
import { defineModule } from "../build/defineModule"

// bunShell.cwd("/home/cody/git/")
const bun = {
  $: bunShell,
  file: bunFile,
  write: bunWrite,
  fetch: bunFetch,
}

export default defineModule({
  name: "bun",
  description: "Shell execution and file operations using Bun runtime",
  api: bun,
  globals: {
    $: bunShell,
    file: bunFile,
    write: bunWrite,
  }
})
