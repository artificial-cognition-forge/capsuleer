import { $ } from "bun"
import { readdirSync } from "node:fs"

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
                        const result = await eval(payload.code)
                        origLog(JSON.stringify({ ok: true, result: logs.length ? logs : result }))
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
        const mod = await import(`${dir}/${file}`) as { default: { name: string; api: Record<string, any> } }
        ;(global as any)[mod.default.name] = mod.default.api
    }
}