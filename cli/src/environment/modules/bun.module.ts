import { $ as bunShell, file as bunFile, write as bunWrite } from "bun"
import { defineModule } from "../build/defineModule"

// bunShell.cwd("/home/cody/git/")
const bun = {
  /**
   * Execute shell commands using Bun's shell template tag.
   * @example await $`ls -la`
   * @example await $`git status`
   */
  $: bunShell,

  /**
   * Read a file using Bun's file API.
   * @example const f = file("./package.json"); await f.json()
   * @example const f = file("./README.md"); await f.text()
   */
  file: bunFile,

  /**
   * Write data to a file using Bun's write API.
   * @example await write("./output.txt", "Hello World")
   */
  write: bunWrite,
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
