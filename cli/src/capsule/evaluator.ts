/**
 * Evaluator subprocess
 *
 * Runs in a separate Bun process, reads code from stdin, evaluates it securely,
 * and writes results to stdout.
 *
 * Protocol:
 * - Input: JSON with { requestId, code }
 * - Output: JSON with { requestId, result } or { requestId, error }
 */

import { runCodeInProcess } from "./code"

const capabilitiesJson = process.argv[2] || "{}"
const capabilities = JSON.parse(capabilitiesJson)

async function readLines() {
    const reader = Bun.stdin.stream().getReader()

    while (true) {
        try {
            const { done, value } = await reader.read()
            if (done) break

            const text = new TextDecoder().decode(value)
            const lines = text.split("\n").filter(l => l.trim())

            for (const line of lines) {
                try {
                    const request = JSON.parse(line)
                    const { requestId, code } = request

                    // Evaluate code securely with capabilities in context
                    const result = await runCodeInProcess({
                        code,
                        context: capabilities,
                        timeoutMs: 10000,
                    })

                    // Send response back to parent
                    if (result.error) {
                        console.log(JSON.stringify({ requestId, error: result.error }))
                    } else {
                        console.log(JSON.stringify({ requestId, result: result.result }))
                    }
                } catch (e) {
                    console.error("[Evaluator] Failed to parse request:", e)
                }
            }
        } catch (error) {
            console.error("[Evaluator] Read error:", error)
            break
        }
    }
}

readLines()
