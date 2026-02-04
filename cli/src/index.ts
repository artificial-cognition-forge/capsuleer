import { cli } from "./cli"

export async function main() {
    const args = process.argv.slice(2)
    const [command, subcommand] = args

    try {
        // Top-level commands
        if (command === "daemon") {
            if (subcommand === "runtime") {
                // Keep the daemon running - block forever
                console.log("Daemon started. Press Ctrl+C to stop.")
                await cli.daemon.runtime()
                return
            }

            if (subcommand === "health") {
                return await cli.daemon.health()
            }
            if (subcommand === "stop") {
                await cli.daemon.stop()
                return
            }
            if (subcommand === "restart") {
                const shouldTrace = args.includes("--trace")
                await cli.daemon.restart({ trace: shouldTrace })
                if (shouldTrace) {
                    await cli.tail.run()
                }
                return
            }
            if (subcommand === "install") {
                await cli.daemon.install()
                return
            }
            console.error("daemon requires a subcommand: start, stop, restart, install")
            process.exit(1)
        }

        if (command === "ls") {
            await cli.daemon.capsules.list()
            return
        }

        if (command === "restart") {
            const shouldTrace = args.includes("--trace")
            await cli.daemon.restart({ trace: shouldTrace })
            if (shouldTrace) {
                await cli.tail.run()
            }
            return
        }

        if (command === "health") {
            await cli.health()
            return
        }

        if (command === "stop") {
            await cli.daemon.stop()
            return
        }

        if (command === "start") {
            await cli.daemon.runtime()
            return
        }

        if (command === "up") {
            await cli.up()
            return
        }

        if (command === "down") {
            await cli.down()
            return
        }

        if (command === "attach") {
            console.log(args)
            if (!args[1]) {
                console.log("attach requires a connection string")
                return
            }

            await cli.daemon.capsules.attach(args[1])
            return
        }

        // Nested commands: capsule, ssh, log
        if (command === "capsule" && subcommand) {
            if (subcommand === "list") {
                await cli.capsule.list()
                return
            }

            if (subcommand === "attach") {
                const connString = args[2]
                if (!connString) {
                    console.error("capsule attach requires a connection string")
                    console.error("Format: capsuleer capsule attach [user@]host:port/capsule-name")
                    console.error("Examples:")
                    console.error("  capsuleer capsule attach localhost:2423/default")
                    console.error("  capsuleer capsule attach user@127.0.0.1:2423/myapp")
                    process.exit(1)
                }
                const keyFlagIndex = args.findIndex(arg => arg.startsWith("--key="))
                const key = keyFlagIndex !== -1 ? args[keyFlagIndex].slice(6) : undefined
                const modeFlagIndex = args.findIndex(arg => arg.startsWith("--mode="))
                const mode = modeFlagIndex !== -1 ? args[modeFlagIndex].slice(7) as "shell" | "bun" : undefined
                await cli.capsule.attach(connString, { key, mode })
                return
            }
        }

        if (command === "tail") {
            await cli.tail.run()
            return
        }

        if (command === "help") {
            await cli.help()
            return
        }

        // Unknown command
        console.error(`Unknown command: ${command}`)
        await cli.help()
        process.exit(1)
    } catch (error) {
        console.error("Error:", error)
        process.exit(1)
    }
}
