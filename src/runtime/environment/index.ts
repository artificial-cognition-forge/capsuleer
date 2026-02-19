import { $, file } from "bun"

declare global {
    var hello: () => string
    var greet: (name: string) => string
    var add: (a: number, b: number) => number
}

global.hello = () => "Hello from Bun!"
global.greet = (name: string) => `Hello, ${name}!`
global.add = (a: number, b: number) => a + b

process.stdin.on("data", async (chunk) => {
    const message = chunk.toString()

    try {
        const payload = JSON.parse(message)

        if (payload.type === "ts") {
            const result = await eval(payload.code)
            console.log(JSON.stringify({ ok: true, result }))
        }

        if (payload.type === "shell") {
            const result = await $`${{ raw: payload.command }}`
            console.log(JSON.stringify({ ok: true, result: result.text() }))
        }

    } catch (err) {
        console.error(JSON.stringify({ ok: false, error: String(err) }))
    }
})