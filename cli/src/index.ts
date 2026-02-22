import { cli } from "./cli"

export async function main() {
    const args = process.argv.slice(2)
    const [command, subcommand] = args

    try {
        if (command === "install") {
            await cli.capsule.install()
            return
        }

        if (command === "uninstall") {
            await cli.capsule.uninstall()
            return
        }

        if (command === "module") {
            if (subcommand === "list") {
                await cli.capsule.module.list()
                return
            }
            console.error("module requires a subcommand: list")
            process.exit(1)
        }

        if (command === "help") {
            return await cli.help()
        }

        process.exit(1)
    } catch (error) {
        console.error("Error:", error)
        process.exit(1)
    }
}
