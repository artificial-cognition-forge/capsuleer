import { $ as bunShell, file as bunFile, write as bunWrite } from "bun"
import { defineModule } from "../build/defineModule"

bunShell.cwd("/home/cody/git/")
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

  help(): void {
    console.log(`
# bun

Bun runtime utilities for shell execution and file operations.

## API

\`\`\`ts
declare global {
  /**
   * Execute shell commands using tagged template literals.
   * Returns a ShellPromise that resolves to a ShellOutput.
   */
  const $: (template: TemplateStringsArray, ...args: any[]) => ShellPromise

  interface ShellPromise extends Promise<ShellOutput> {
    /** Get stdout as a string */
    text(): Promise<string>
    /** Get stdout as JSON */
    json(): Promise<any>
    /** Get stdout as a Buffer */
    arrayBuffer(): Promise<ArrayBuffer>
  }

  interface ShellOutput {
    /** Exit code of the command */
    exitCode: number
    /** Standard output as a string */
    stdout: string
    /** Standard error as a string */
    stderr: string
    /** Get stdout as text */
    text(): string
    /** Parse stdout as JSON */
    json(): any
  }

  /**
   * Read a file from disk.
   * Returns a BunFile handle that can be read in various formats.
   */
  function file(path: string): BunFile

  interface BunFile {
    /** Read file as text */
    text(): Promise<string>
    /** Read file as JSON */
    json(): Promise<any>
    /** Read file as ArrayBuffer */
    arrayBuffer(): Promise<ArrayBuffer>
    /** Read file as Blob */
    blob(): Promise<Blob>
    /** File size in bytes */
    size: number
    /** File type/MIME type */
    type: string
  }

  /**
   * Write data to a file.
   * Creates the file if it doesn't exist, overwrites if it does.
   */
  function write(path: string, data: string | Buffer | Blob): Promise<void>
}
\`\`\`

## Examples

\`\`\`ts
// Shell execution
const result = await $\`ls -la\`
console.log(result.stdout)

// Get text directly
const text = await $\`cat package.json\`.text()

// File reading
const f = file("./package.json")
const pkg = await f.json()
console.log(pkg.name)

// File writing
await write("./output.txt", "Hello World")
\`\`\`
`.trim())
  },
}

export default defineModule({
  name: "bun",
  description: "Shell execution and file operations using Bun runtime",
  jsdoc: "declare const $: (template: TemplateStringsArray, ...args: any[]) => Promise<{ exitCode: number; stdout: string; stderr: string; text(): string; json(): any }> & { text(): Promise<string>; json(): Promise<any>; arrayBuffer(): Promise<ArrayBuffer> }; declare function file(path: string): { text(): Promise<string>; json(): Promise<any>; arrayBuffer(): Promise<ArrayBuffer>; blob(): Promise<Blob>; size: number; type: string }; declare function write(path: string, data: string | Buffer | Blob): Promise<void>",
  api: bun,
  // Expose functions as individual globals
  globals: {
    $: bunShell,
    file: bunFile,
    write: bunWrite,
  }
})
