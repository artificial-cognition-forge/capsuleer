import { $ as bunShell, file as bunFile, write as bunWrite, fetch as bunFetch } from "bun"
import { defineModule } from "../build/defineModule"

/**
 * Execute shell commands using tagged template literals.
 * Returns stdout, stderr, and exit code.
 *
 * @example
 * const result = await $`ls -la`
 * console.log(result.stdout)
 */
type BunShell = (
  template: TemplateStringsArray,
  ...values: any[]
) => Promise<{
  stdout: string
  stderr: string
  exitCode: number
}>

/**
 * Fetch resources from the network (HTTP/HTTPS).
 * Bun's implementation of the standard fetch API.
 *
 * @example
 * const response = await fetch("https://api.example.com/data")
 * const data = await response.json()
 */
type BunFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

type BunRuntime = {
  $: BunShell
  fetch: BunFetch
}

const bun: BunRuntime = {
  $: bunShell as any as BunShell,
  fetch: bunFetch as BunFetch,
}

export default defineModule({
  name: "bun",
  description: "Shell execution and file operations using Bun runtime",
  api: bun,
  globals: bun as BunRuntime
})
