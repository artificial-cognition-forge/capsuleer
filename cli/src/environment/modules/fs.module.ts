import { $ } from "bun"
import { writeFile, unlink, access, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { Glob } from "bun"
import { defineModule } from "../build/defineModule"

type GrepMatch = { file: string; line: number; text: string; match: string }

const fs = {
    cwd(): string {
        return process.cwd()
    },

    cd(path: string): void {
        process.chdir(path)
    },

    async read(path: string): Promise<string> {
        return (await $`cat ${path}`).text()
    },

    async write(path: string, content: string): Promise<void> {
        await writeFile(path, content, "utf8")
    },

    async list(path = "."): Promise<string[]> {
        const out = await $`ls ${path}`.text()
        return out.trim().split("\n").filter(Boolean)
    },

    async exists(path: string): Promise<boolean> {
        return access(path).then(() => true, () => false)
    },

    async delete(path: string): Promise<void> {
        await unlink(path)
    },

    async find(pattern: string, opts: { cwd?: string } = {}): Promise<string[]> {
        const cwd = opts.cwd ?? "."
        const glob = new Glob(pattern)
        const results: string[] = []
        for await (const file of glob.scan({ cwd, onlyFiles: true })) {
            results.push(join(cwd, file))
        }
        return results
    },

    async grep(pattern: string, path = ".", opts: { cwd?: string; recursive?: boolean } = {}): Promise<GrepMatch[]> {
        const regex = new RegExp(pattern)
        const results: GrepMatch[] = []
        const root = opts.cwd ? join(opts.cwd, path) : path

        async function searchFile(filePath: string) {
            const content = await readFile(filePath, "utf8")
            content.split("\n").forEach((text, i) => {
                const m = text.match(regex)
                if (m) results.push({ file: filePath, line: i + 1, text, match: m[0] })
            })
        }

        async function searchPath(target: string) {
            let stat: import("node:fs").Stats
            try { stat = await import("node:fs/promises").then(m => m.stat(target)) }
            catch { return }

            if (stat.isFile()) {
                await searchFile(target)
            } else if (stat.isDirectory() && opts.recursive) {
                const entries = await readdir(target, { withFileTypes: true })
                await Promise.all(entries.map(e => searchPath(join(target, e.name))))
            }
        }

        await searchPath(root)
        return results
    },

    help(): void {
        console.log(`
# fs

Filesystem operations module.

## API

\`\`\`ts
declare global {
  type GrepMatch = { file: string; line: number; text: string; match: string }

  const fs: {
    /** Return the current working directory. */
    cwd(): string

    /** Change the current working directory. */
    cd(path: string): void

    /** Read the contents of a file. */
    read(path: string): Promise<string>

    /** Write content to a file, creating it if it does not exist. */
    write(path: string, content: string): Promise<void>

    /** List entries in a directory. Defaults to current directory. */
    list(path?: string): Promise<string[]>

    /** Return true if the path exists, false otherwise. */
    exists(path: string): Promise<boolean>

    /** Delete a file at the given path. */
    delete(path: string): Promise<void>

    /** Find files matching a glob pattern.
     *  @example fs.find("**\/*.ts", { cwd: "./src" }) */
    find(pattern: string, opts?: { cwd?: string }): Promise<string[]>

    /** Search file contents by regex. Pass { recursive: true } to walk directories.
     *  @example fs.grep("TODO", "./src", { cwd: "./project", recursive: true }) */
    grep(pattern: string, path?: string, opts?: { cwd?: string; recursive?: boolean }): Promise<GrepMatch[]>

    /** Print this help page. */
    help(): void
  }
}
\`\`\`
`.trim())
    },
}


export default defineModule({
    name: "fs",
    description: "Filesystem operations for reading, writing, and searching files",
    api: fs
})