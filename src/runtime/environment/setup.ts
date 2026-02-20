import { $ } from "bun"
import { readdirSync } from "node:fs"

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

                if (payload.type === "ts") {
                    const logs: unknown[] = []
                    const origLog = console.log
                    console.log = (...args) => logs.push(args.length === 1 ? args[0] : args)
                    try {
                        // Create an async function with access to globals
                        // This ensures that all global variables (like $, file, write, fs) are accessible
                        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor
                        const fn = new AsyncFunction(payload.code)
                        const result = await fn.call(global)

                        // Serialize result, converting Buffers to strings
                        const serializedResult = serializeValue(logs.length ? logs : result)
                        origLog(JSON.stringify({ ok: true, result: serializedResult }))
                        // Flush stdout to ensure output is sent immediately
                        process.stdout.write("")
                    } finally {
                        console.log = origLog
                    }
                }

                if (payload.type === "shell") {
                    const result = await $`${{ raw: payload.command }}`.quiet()
                    console.log(JSON.stringify({ ok: true, result: result.text() }))
                    // Flush stdout to ensure output is sent immediately
                    process.stdout.write("")
                }

            } catch (err) {
                console.error(JSON.stringify({ ok: false, error: String(err) }))
            }
        }
    })
}

export async function loadModules() {
    const dir = new URL("./modules", import.meta.url).pathname
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
        ;(global as any)[mod.default.name] = mod.default.api

        // Register individual globals if specified (e.g., global.$ = ...)
        if (mod.default.globals) {
            for (const [key, value] of Object.entries(mod.default.globals)) {
                ;(global as any)[key] = value
            }
        }
    }
}