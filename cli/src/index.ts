import { cli } from "./cli"

export async function main() {
    const args = process.argv.slice(2)
    const [command, subcommand] = args

    try {
        // Top-level commands
        if (command === "daemon") {
            if (subcommand === "runtime") {
                await cli.daemon.runtime()
                return
            }

            if (subcommand === "health") {
                return await cli.daemon.health()
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

        // RPC endpoint for client SDK access
        if (command === "rpc") {
            if (subcommand === "stdio") {
                await cli.rpc.stdio()
                return
            }
            console.error("rpc requires a subcommand: stdio")
            process.exit(1)
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
