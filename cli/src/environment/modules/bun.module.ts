import { $ as bunShell, file as bunFile, write as bunWrite, fetch as bunFetch } from "bun"
import { defineModule } from "../build/defineModule"

type BunShell = (
  strings: TemplateStringsArray,
  ...values: any[]
) => Promise<{
  stdout: string
  stderr: string
  exitCode: number
}>

type BunFetch = typeof fetch

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
