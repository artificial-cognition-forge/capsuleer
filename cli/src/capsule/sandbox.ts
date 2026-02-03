import { randomUUID } from "crypto"

export type SandboxInstance = {
    id: string
    capsuleId: string
    process: Bun.Subprocess
    createdAt: Date
}

type PendingRequest = {
    resolve: (value: string) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
}

class SandboxManager {
    private instances = new Map<string, SandboxInstance>()
    private pendingRequests = new Map<string, PendingRequest>()
    private requestCounter = 0

    async spawn(capsuleId: string, capabilities?: Record<string, any>) {
        const sandboxId = randomUUID()

        // Spawn the evaluator subprocess
        const process = Bun.spawn([
            "bun",
            "run",
            new URL("./evaluator.ts", import.meta.url).pathname,
            JSON.stringify(capabilities || {})
        ], {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "inherit"
        })

        const instance: SandboxInstance = {
            id: sandboxId,
            capsuleId,
            process,
            createdAt: new Date()
        }

        this.instances.set(sandboxId, instance)

        // Listen to stdout for responses
        this.listenToSandbox(sandboxId, process)

        return sandboxId
    }

    async eval(sandboxId: string, code: string): Promise<any> {
        const instance = this.instances.get(sandboxId)
        if (!instance) {
            throw new Error(`Sandbox '${sandboxId}' not found`)
        }

        const requestId = `${sandboxId}:${++this.requestCounter}`

        return new Promise((resolve, reject) => {
            // Set 15s timeout (10s for code execution + buffer)
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId)
                reject(new Error("Sandbox evaluation timeout"))
            }, 15000)

            this.pendingRequests.set(requestId, { resolve, reject, timeout })

            // Send code to sandbox
            const message = JSON.stringify({ requestId, code })
            instance.process.stdin?.write(message + "\n")
        })
    }

    private listenToSandbox(_sandboxId: string, process: Bun.Subprocess) {
        const stdout = process.stdout
        if (!stdout || typeof stdout === "number") return
        const reader = stdout.getReader()
        if (!reader) return

        const readLoop = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    const text = new TextDecoder().decode(value)
                    const lines = text.split("\n").filter(l => l.trim())

                    for (const line of lines) {
                        try {
                            const response = JSON.parse(line)
                            const request = this.pendingRequests.get(response.requestId)
                            if (request) {
                                clearTimeout(request.timeout)
                                this.pendingRequests.delete(response.requestId)
                                if (response.error) {
                                    request.reject(new Error(response.error))
                                } else {
                                    request.resolve(response.result)
                                }
                            }
                        } catch (e) {
                            console.error("[Sandbox] Failed to parse response:", e)
                        }
                    }
                }
            } catch (error) {
                console.error("[Sandbox] Read error:", error)
            }
        }

        readLoop()
    }

    async kill(sandboxId: string) {
        const instance = this.instances.get(sandboxId)
        if (!instance) return

        try {
            instance.process.kill()
            this.instances.delete(sandboxId)
        } catch (error) {
            console.error(`[Sandbox] Failed to kill sandbox '${sandboxId}':`, error)
        }
    }

    list() {
        return Array.from(this.instances.values()).map(i => ({
            id: i.id,
            capsuleId: i.capsuleId,
            createdAt: i.createdAt
        }))
    }
}

export const sandbox = new SandboxManager()