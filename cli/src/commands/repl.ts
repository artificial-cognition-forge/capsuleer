import { spawn, ChildProcess } from "child_process"
import * as readline from "readline"
import chalk from "chalk"
import { join } from "path"
import { fileURLToPath } from "url"

type ModuleManifest = {
    module: string
    description?: string
    exports: Array<{
        name: string
        declaration: string
        jsdoc?: string
    }>
}

type CapsuleEvent =
    | { type: "module:manifest"; module: string; description?: string; exports: ModuleManifest["exports"] }
    | { id: string; type: "start" }
    | { id: string; type: "stdin"; data: string }
    | { id: string; type: "stdout"; data: unknown }
    | { id: string; type: "stderr"; data: string }
    | { id: string; type: "exit"; ok: true; result: unknown }
    | { id: string; type: "error"; ok: false; error: string }

export async function repl() {
    console.log(chalk.cyan.bold("\nCapsule\n"))

    // Spawn the capsule process
    const __dirname = fileURLToPath(new URL(".", import.meta.url))
    const environmentPath = join(__dirname, "../environment")

    const capsule = spawn("bun", ["run", "index.ts"], {
        cwd: environmentPath,
        stdio: ["pipe", "pipe", "pipe"],
    })

    if (!capsule.stdout || !capsule.stdin) {
        console.error(chalk.red("Failed to start capsule process"))
        process.exit(1)
    }

    const manifests = new Map<string, ModuleManifest>()
    const pendingCommands = new Map<string, {
        resolve: (result: unknown) => void
        reject: (error: Error) => void
        output: unknown[]
    }>()

    let commandIdCounter = 0
    let isReady = false
    let buffer = ""

    let manifestLoadTimeout: NodeJS.Timeout | null = null

    // Parse stdout events
    capsule.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
            if (!line.trim()) continue

            try {
                const event: CapsuleEvent = JSON.parse(line)

                // Handle manifest events
                if (event.type === "module:manifest") {
                    manifests.set(event.module, {
                        module: event.module,
                        description: event.description,
                        exports: event.exports,
                    })

                    // Reset timeout when we get a manifest (more might be coming)
                    if (manifestLoadTimeout) clearTimeout(manifestLoadTimeout)
                    manifestLoadTimeout = setTimeout(() => {
                        if (!isReady) {
                            isReady = true
                            displayWelcome(manifests)
                            startREPL()
                        }
                    }, 500) // Wait 500ms after last manifest before starting REPL

                    continue
                }

                // Handle command events
                if ("id" in event) {
                    const pending = pendingCommands.get(event.id)
                    if (!pending) continue

                    if (event.type === "stdout") {
                        pending.output.push(event.data)
                        // Display output in real-time
                        console.log(formatOutput(event.data))
                    } else if (event.type === "stderr") {
                        console.log(chalk.red(event.data))
                    } else if (event.type === "exit") {
                        // Don't display result if we already showed stdout
                        if (pending.output.length === 0 && event.result !== undefined) {
                            console.log(formatOutput(event.result))
                        }
                        pending.resolve(event.result)
                        pendingCommands.delete(event.id)
                    } else if (event.type === "error") {
                        console.log(chalk.red("Error: " + event.error))
                        pending.reject(new Error(event.error))
                        pendingCommands.delete(event.id)
                    }
                }
            } catch (error) {
                // Ignore parse errors for non-JSON lines
            }
        }
    })

    capsule.stderr.on("data", (chunk: Buffer) => {
        const output = chunk.toString()
        if (!output.includes("Shell cwd was reset")) {
            console.error(chalk.red(output))
        }
    })

    capsule.on("error", (error) => {
        console.error(chalk.red("Capsule process error:"), error)
        process.exit(1)
    })

    capsule.on("exit", (code) => {
        console.log(chalk.yellow(`\nCapsule exited with code ${code}`))
        process.exit(code || 0)
    })

    // Execute TypeScript code in capsule
    async function execute(code: string): Promise<unknown> {
        const id = `cmd-${commandIdCounter++}`

        return new Promise((resolve, reject) => {
            pendingCommands.set(id, {
                resolve,
                reject,
                output: [],
            })

            const payload = JSON.stringify({
                id,
                type: "ts",
                code,
                stream: true,
            })

            capsule.stdin!.write(payload + "\n")

            // Timeout after 30 seconds
            setTimeout(() => {
                const pending = pendingCommands.get(id)
                if (pending) {
                    pendingCommands.delete(id)
                    reject(new Error("Command timeout"))
                }
            }, 30000)
        })
    }

    // Display welcome message with available modules
    function displayWelcome(manifests: Map<string, ModuleManifest>) {
        // console.log(chalk.green("✓ Capsule ready!\n"))
        // console.log(chalk.bold("Available modules:"))

        // for (const [name, manifest] of manifests) {
        //     console.log(chalk.cyan(`  • ${name}`) + chalk.gray(` - ${manifest.description || "No description"}`))
        // }

        // console.log(chalk.gray("\nType .help for commands, .exit to quit\n"))
    }

    // Format output values
    function formatOutput(value: unknown): string {
        if (value === undefined) return chalk.gray("undefined")
        if (value === null) return chalk.gray("null")
        if (typeof value === "string") return value
        if (typeof value === "number") return chalk.yellow(String(value))
        if (typeof value === "boolean") return chalk.yellow(String(value))
        return chalk.gray(JSON.stringify(value, null, 2))
    }

    // Start the REPL
    function startREPL() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk.blue("> "),
            terminal: true,
        })

        rl.prompt()

        rl.on("line", async (input: string) => {
            const trimmed = input.trim()

            // Handle REPL commands
            if (trimmed === ".exit" || trimmed === ".quit") {
                console.log(chalk.gray("Goodbye!"))
                capsule.kill()
                process.exit(0)
            }

            if (trimmed === ".help") {
                displayHelp()
                rl.prompt()
                return
            }

            if (trimmed === ".modules") {
                displayModules(manifests)
                rl.prompt()
                return
            }

            if (trimmed.startsWith(".module ")) {
                const moduleName = trimmed.slice(8).trim()
                displayModuleDetails(manifests.get(moduleName))
                rl.prompt()
                return
            }

            if (trimmed === ".clear") {
                console.clear()
                rl.prompt()
                return
            }

            if (!trimmed) {
                rl.prompt()
                return
            }

            // Execute code
            try {
                await execute(trimmed)
            } catch (error) {
                if (error instanceof Error) {
                    console.log(chalk.red("Error: ") + error.message)
                }
            }

            rl.prompt()
        })

        rl.on("close", () => {
            console.log(chalk.gray("\nGoodbye!"))
            capsule.kill()
            process.exit(0)
        })
    }

    function displayHelp() {
        console.log(chalk.bold("\nREPL Commands:"))
        console.log(chalk.cyan("  .help") + chalk.gray("      - Show this help"))
        console.log(chalk.cyan("  .modules") + chalk.gray("   - List available modules"))
        console.log(chalk.cyan("  .module <name>") + chalk.gray(" - Show module details"))
        console.log(chalk.cyan("  .clear") + chalk.gray("     - Clear the screen"))
        console.log(chalk.cyan("  .exit") + chalk.gray("      - Exit the REPL\n"))
    }

    function displayModules(manifests: Map<string, ModuleManifest>) {
        console.log(chalk.bold("\nAvailable Modules:"))
        for (const [name, manifest] of manifests) {
            console.log(chalk.cyan(`  ${name}`) + chalk.gray(` - ${manifest.description || "No description"}`))
            console.log(chalk.gray(`    ${manifest.exports.length} exports`))
        }
        console.log()
    }

    function displayModuleDetails(manifest?: ModuleManifest) {
        if (!manifest) {
            console.log(chalk.red("Module not found"))
            return
        }

        console.log(chalk.bold(`\n${manifest.module}`))
        if (manifest.description) {
            console.log(chalk.gray(manifest.description))
        }
        console.log(chalk.bold("\nExports:"))

        for (const exp of manifest.exports) {
            console.log(chalk.cyan(`  ${exp.name}`))
            console.log(chalk.gray(`    ${exp.declaration}`))
            if (exp.jsdoc) {
                console.log(chalk.gray(`    ${exp.jsdoc.split("\n").join("\n    ")}`))
            }
        }
        console.log()
    }

    // Wait for capsule to be ready
    await new Promise((resolve) => {
        const checkReady = setInterval(() => {
            if (isReady) {
                clearInterval(checkReady)
                resolve(undefined)
            }
        }, 100)
    })
}
