import { $ } from "bun"
import { readdirSync } from "node:fs"
import { generateAllManifests, type ModuleManifest } from "./generateManifests"

/**
 * Recursively serialize values, converting Buffers to strings.
 * This ensures that Bun shell outputs (which are Buffers) are properly displayed.
 */
function serializeValue(value: unknown): unknown {
    // Handle Buffer objects (from Bun shell outputs)
    if (Buffer.isBuffer(value)) {
        return value.toString('utf-8')
    }

    // Handle arrays
    if (Array.isArray(value)) {
        return value.map(serializeValue)
    }

    // Handle plain objects
    if (value && typeof value === 'object' && value.constructor === Object) {
        const serialized: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(value)) {
            serialized[key] = serializeValue(val)
        }
        return serialized
    }

    // Return primitives and other types as-is
    return value
}

export type CapsuleerRuntimeEvent =
    | { id: string; type: "start" }
    | { id: string; type: "stdin"; data: string }
    | { id: string; type: "stdout"; data: unknown }
    | { id: string; type: "stderr"; data: string }
    | { id: string; type: "exit"; ok: true; result: unknown }
    | { id: string; type: "error"; ok: false; error: string }

// Save the original console.log at module level before any interception
const originalLog = console.log

function emitEvent(event: CapsuleerRuntimeEvent) {
    originalLog(JSON.stringify(event))
    process.stdout.write("") // Flush
}

export async function setup() {
    let buffer = ""

    process.stdin.on("data", async (chunk) => {
        buffer += chunk.toString()

        // Process all complete lines (separated by newlines)
        const lines = buffer.split("\n")
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || ""

        for (const line of lines) {
            if (!line.trim()) continue // Skip empty lines

            try {
                const payload = JSON.parse(line)

                const { id, type, code, stream = true, cwd = "/home/cody/git/playground/" } = payload // TODO: remove this hardcoded path

                if (!id) {
                    console.error(JSON.stringify({ ok: false, error: "Missing command ID" }))
                    continue
                }

                if (stream) {
                    emitEvent({ id, type: "start" })
                    emitEvent({ id, type: "stdin", data: code })
                }

                if (type === "ts") {
                    const logs: unknown[] = []

                    // Capture console.log calls if streaming
                    if (stream) {
                        console.log = (...args) => {
                            const data = args.length === 1 ? args[0] : args
                            logs.push(data)
                            emitEvent({ id, type: "stdout", data: serializeValue(data) })
                        }
                    } else {
                        console.log = (...args) => logs.push(args.length === 1 ? args[0] : args)
                    }

                    try {
                        // Transpile TypeScript to JavaScript to strip type annotations
                        const transpiler = new Bun.Transpiler({ loader: "ts" })
                        const jsCodeRaw = transpiler.transformSync(code)
                        const jsCode = `await fs.cd(${cwd});\n${jsCodeRaw}`


                        // Create an async function with access to globals
                        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor
                        const fn = new AsyncFunction(jsCode)
                        const result = await fn.call(global)

                        const serializedResult = serializeValue(logs.length ? logs : result)

                        if (stream) {
                            emitEvent({ id, type: "exit", ok: true, result: serializedResult })
                        } else {
                            originalLog(JSON.stringify({ id, ok: true, result: serializedResult }))
                            process.stdout.write("")
                        }
                    } catch (err) {
                        if (stream) {
                            emitEvent({ id, type: "error", ok: false, error: String(err) })
                        } else {
                            originalLog(JSON.stringify({ id, ok: false, error: String(err) }))
                            process.stdout.write("")
                        }
                    } finally {
                        console.log = originalLog
                    }
                }

                if (type === "shell") {
                    try {
                        const result = await $`${{ raw: code }}`.quiet()
                        const output = result.text()

                        if (stream) {
                            emitEvent({ id, type: "exit", ok: true, result: output })
                        } else {
                            console.log(JSON.stringify({ id, ok: true, result: output }))
                            process.stdout.write("")
                        }
                    } catch (err) {
                        if (stream) {
                            emitEvent({ id, type: "error", ok: false, error: String(err) })
                        } else {
                            console.log(JSON.stringify({ id, ok: false, error: String(err) }))
                            process.stdout.write("")
                        }
                    }
                }

            } catch (err) {
                console.error(JSON.stringify({ ok: false, error: String(err) }))
            }
        }
    })
}

export async function loadModules() {
    // Generate and emit manifests for all modules
    const manifests = generateAllManifests()
    for (const manifest of manifests) {
        originalLog(JSON.stringify({
            type: "module:manifest",
            module: manifest.moduleName,
            description: manifest.description,
            exports: manifest.exports
        }))
        process.stdout.write("") // Flush
    }

    const dir = new URL("../modules", import.meta.url).pathname
    const files = readdirSync(dir).filter(f => f.endsWith(".module.ts"))

    for (const file of files) {
        const mod = await import(`${dir}/${file}`) as {
            default: {
                name: string
                api: Record<string, any>
                globals?: Record<string, any>
            }
        }

            // Register module namespace (e.g., global.fs = { ... })
            ; (global as any)[mod.default.name] = mod.default.api

        // Register individual globals if specified (e.g., global.$ = ...)
        if (mod.default.globals) {
            for (const [key, value] of Object.entries(mod.default.globals)) {
                ; (global as any)[key] = value
            }
        }
    }
}