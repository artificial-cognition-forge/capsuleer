import { existsSync, mkdirSync, rmSync, cpSync, readdirSync } from "fs"
import { join } from "path"
import { spawn } from "child_process"
import { print } from "./print"

function getCapsuleDir(): string {
    const home = process.env.HOME
    if (!home) throw new Error("HOME environment variable not set")
    return join(home, ".capsuleer")
}

function getEnvironmentDir(): string {
    return join(getCapsuleDir(), "environment")
}

function getSourceEnvironmentDir(): string {
    // Path to the bundled environment directory in the npm package
    // cli/src/capsule.ts -> ./environment
    const currentDir = new URL(".", import.meta.url).pathname
    return join(currentDir, "environment")
}

function ensureCapsuleDir(): void {
    const dir = getCapsuleDir()
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
}

async function runBunInstall(cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn("bun", ["install"], {
            cwd,
            stdio: "inherit",
        })

        proc.on("close", (code) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`bun install failed with code ${code}`))
            }
        })

        proc.on("error", (err) => {
            reject(err)
        })
    })
}

export const capsule = {
    async install() {
        print.header()
        print.success("Installing capsule environment")

        ensureCapsuleDir()

        const sourceDir = getSourceEnvironmentDir()
        const targetDir = getEnvironmentDir()

        // Check if source exists
        if (!existsSync(sourceDir)) {
            throw new Error(`Source environment directory not found: ${sourceDir}`)
        }

        // Remove existing installation if present
        if (existsSync(targetDir)) {
            print.success("Removing existing installation")
            rmSync(targetDir, { recursive: true, force: true })
        }

        // Copy environment directory
        print.success("Copying environment files")
        cpSync(sourceDir, targetDir, { recursive: true })

        // Run bun install
        print.success("Installing dependencies")
        print.blank()
        await runBunInstall(targetDir)

        print.blank()
        print.success("Environment installed")
        print.path(targetDir)
        print.blank()
    },

    async uninstall() {
        print.header()

        const targetDir = getEnvironmentDir()

        if (!existsSync(targetDir)) {
            print.dim("Environment not installed")
            print.blank()
            return
        }

        rmSync(targetDir, { recursive: true, force: true })

        print.success("Environment uninstalled")
        print.blank()
    },

    module: {
        async add() {
            // TODO: Add module functionality
        },

        async remove() {
            // TODO: Remove module functionality
        },

        async list() {
            print.header()

            const targetDir = getEnvironmentDir()

            if (!existsSync(targetDir)) {
                print.dim("Environment not installed")
                print.blank()
                return
            }

            const modulesDir = join(targetDir, "modules")
            if (!existsSync(modulesDir)) {
                print.dim("No modules directory found")
                print.blank()
                return
            }

            const files = readdirSync(modulesDir).filter(f => f.endsWith(".module.ts"))

            if (files.length === 0) {
                print.dim("No modules found")
                print.blank()
                return
            }

            for (const file of files) {
                try {
                    const modulePath = join(modulesDir, file)
                    const mod = await import(modulePath) as {
                        default: {
                            name: string
                            description?: string
                        }
                    }

                    const name = mod.default.name
                    const description = mod.default.description || "No description"

                    print.module(name, description)
                    print.blank()
                } catch (err) {
                    print.error(`Failed to load ${file}: ${err}`)
                }
            }
        }
    },
}
