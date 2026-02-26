import { writeFile, unlink, access, readdir, readFile, mkdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { $, Glob } from "bun"
import { defineModule } from "../build/defineModule"
import { rm } from "node:fs/promises"

type CapsuleResult<T = unknown> = {
    ok: boolean
    op: string
    data?: T
    error?: string
}

type GrepMatch = { file: string; line: number; text: string; match: string }

const fs = {
    async cwd() {
        const path = await $`pwd`.json()

        // const path = process.cwd()
        console.log(JSON.stringify({
            ok: true,
            op: "fs.cwd",
            data: { path }
        }))

        return path
    },

    async cd(path: string) {
        try {
            process.chdir(path)
            console.log(JSON.stringify({
                ok: true,
                op: "fs.cd",
                data: { path, cwd: process.cwd() }
            }))
        } catch (err: any) {
            console.log(JSON.stringify({
                ok: false,
                op: "fs.cd",
                data: { path },
                error: err.message
            }))
            throw err
        }
    },

    async read(path: string): Promise<string> {
        try {
            const content = await readFile(path, "utf8")

            const payload = {
                ok: true,
                op: "fs.read",
                data: {
                    path,
                    bytes: Buffer.byteLength(content),
                    lines: content.split("\n").length,
                    encoding: "utf8",
                    content
                }
            }

            console.log(JSON.stringify(payload))
            return content
        } catch (err: any) {
            console.log(JSON.stringify({
                ok: false,
                op: "fs.read",
                data: { path },
                error: err.message
            }))
            throw err
        }
    },

    async write(path: string, content: string): Promise<void> {
        try {
            await writeFile(path, content, "utf8")
            console.log(JSON.stringify({
                ok: true,
                op: "fs.write",
                data: {
                    path,
                    bytes: Buffer.byteLength(content),
                    lines: content.split("\n").length
                }
            }))
        } catch (err: any) {
            console.log(JSON.stringify({
                ok: false,
                op: "fs.write",
                data: { path },
                error: err.message
            }))
            throw err
        }
    },

    async list(path = "."): Promise<string[]> {
        try {
            const entries = await readdir(path, { withFileTypes: true })
            const data = entries.map(e => ({
                name: e.name,
                type: e.isDirectory() ? "directory" : e.isFile() ? "file" : "other"
            }))
            console.log(JSON.stringify({
                ok: true,
                op: "fs.list",
                data: { path, count: data.length, entries: data }
            }))
            return entries.map(e => e.name)
        } catch (err: any) {
            console.log(JSON.stringify({
                ok: false,
                op: "fs.list",
                data: { path },
                error: err.message
            }))
            throw err
        }
    },

    async exists(path: string): Promise<boolean> {
        try {
            await access(path)
            console.log(JSON.stringify({
                ok: true,
                op: "fs.exists",
                data: { path, exists: true }
            }))
            return true
        } catch {
            console.log(JSON.stringify({
                ok: true,
                op: "fs.exists",
                data: { path, exists: false }
            }))
            return false
        }
    },

    async delete(path: string): Promise<void> {
        try {
            await rm(path, { recursive: true, force: true })

            console.log(JSON.stringify({
                ok: true,
                op: "fs.delete",
                data: { path, deleted: true }
            }))
        } catch (err: any) {
            console.log(JSON.stringify({
                ok: false,
                op: "fs.delete",
                data: { path },
                error: err.message
            }))
            throw err
        }
    },

    /**
     * Create a directory at the given path.
     *
     * Wraps Node.js `fs.mkdir` semantics. Creates a new directory at `path`.
     * If `opts.recursive` is true (default), parent directories are created
     * as needed and no error is thrown if the directory already exists.
     *
     * Emits a JSON log to stdout with shape:
     * `{ ok: boolean, op: "fs.mkdir", data: { path, recursive }, error?: string }`
     *
     * @param {string} path - File system path of the directory to create. May be absolute or relative.
     * @param {{ recursive?: boolean }} [opts={ recursive: true }] - Options object.
     * @param {boolean} [opts.recursive=true] - Create parent directories recursively.
     *
     * @returns {Promise<void>} Resolves when the directory has been created.
     *
     * @throws {Error} If creation fails (e.g. permission denied, invalid path,
     * non-directory file exists at path, or recursive=false and parent missing).
     *
     * @example
     * await fs.mkdir("./data")
     *
     * @example
     * await fs.mkdir("/tmp/logs", { recursive: false })
     */
    async mkdir(path: string, opts: { recursive?: boolean } = { recursive: true }): Promise<void> {
        try {
            await mkdir(path, opts)
            console.log(JSON.stringify({
                ok: true,
                op: "fs.mkdir",
                data: { path, recursive: opts.recursive ?? false }
            }))
        } catch (err: any) {
            console.log(JSON.stringify({
                ok: false,
                op: "fs.mkdir",
                data: { path, recursive: opts.recursive ?? false },
                error: err.message
            }))
            throw err
        }
    },

    async find(pattern: string, opts: { cwd?: string } = {}): Promise<string[]> {
        try {
            const cwd = opts.cwd ?? "."
            const glob = new Glob(pattern)
            const results: string[] = []
            for await (const file of glob.scan({ cwd, onlyFiles: true })) {
                results.push(join(cwd, file))
            }
            console.log(JSON.stringify({
                ok: true,
                op: "fs.find",
                data: { pattern, cwd, count: results.length, files: results }
            }))
            return results
        } catch (err: any) {
            console.log(JSON.stringify({
                ok: false,
                op: "fs.find",
                data: { pattern, cwd: opts.cwd ?? "." },
                error: err.message
            }))
            throw err
        }
    },

    async grep(pattern: string, path = ".", opts: { cwd?: string; recursive?: boolean } = {}): Promise<GrepMatch[]> {
        try {
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
                let s: import("node:fs").Stats
                try { s = await stat(target) }
                catch { return }

                if (s.isFile()) {
                    await searchFile(target)
                } else if (s.isDirectory() && opts.recursive) {
                    const entries = await readdir(target, { withFileTypes: true })
                    await Promise.all(entries.map(e => searchPath(join(target, e.name))))
                }
            }

            await searchPath(root)
            console.log(JSON.stringify({
                ok: true,
                op: "fs.grep",
                data: { pattern, path, recursive: opts.recursive ?? false, matches: results.length }
            }))
            return results
        } catch (err: any) {
            console.log(JSON.stringify({
                ok: false,
                op: "fs.grep",
                data: { pattern, path },
                error: err.message
            }))
            throw err
        }
    },
}


export default defineModule({
    name: "fs",
    description: "Filesystem operations for reading, writing, and searching files",
    api: fs
})
