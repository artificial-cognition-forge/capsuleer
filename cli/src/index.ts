import { cli } from "./cli"

export async function main() {
    const args = process.argv.slice(2)
    const [command, subcommand] = args

    try {
        // Top-level commands
        if (command === "daemon") {
            if (subcommand === "start") {
                await cli.daemon.start()
                // Keep the daemon running - block forever
                console.log("Daemon started. Press Ctrl+C to stop.")
                await new Promise(() => {
                    // Never resolves - keeps process alive
                })
            }
            if (subcommand === "health") {
                return await cli.daemon.health()
            }
            if (subcommand === "stop") {
                await cli.daemon.stop()
                return
            }
            if (subcommand === "restart") {
                await cli.daemon.restart()
                return
            }
            if (subcommand === "install") {
                await cli.daemon.install()
                return
            }
            console.error("daemon requires a subcommand: start, stop, restart, install")
            process.exit(1)
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
            await cli.daemon.start()
            // Keep the daemon running - block forever
            console.log("Daemon started. Press Ctrl+C to stop.")
            await new Promise(() => {
                // Never resolves - keeps process alive
            })
        }

        if (command === "up") {
            await cli.up()
            return
        }

        if (command === "down") {
            await cli.down()
            return
        }

        // Auth commands
        if (command === "auth") {
            if (subcommand === "setup") {
                await cli.auth.setup()
                return
            }
            if (subcommand === "add") {
                const keyPath = args[2]
                const keyName = args[3]
                if (!keyPath) {
                    console.error("auth add requires a key path or key content")
                    process.exit(1)
                }
                await cli.auth.add(keyPath, keyName)
                return
            }
            if (subcommand === "list") {
                await cli.auth.list()
                return
            }
            if (subcommand === "remove") {
                const fingerprint = args[2]
                if (!fingerprint) {
                    console.error("auth remove requires a fingerprint")
                    process.exit(1)
                }
                await cli.auth.remove(fingerprint)
                return
            }
            console.error("auth requires a subcommand: setup, add, list, remove")
            process.exit(1)
        }

        // Nested commands: capsule, ssh, log
        if (command === "capsule" && subcommand) {
            if (subcommand === "list") {
                await cli.capsule.list()
                return
            }

            if (subcommand === "connect") {
                const capsuleId = args[2] || "default"
                const privateKeyPath = args[3]
                const username = args[4]

                await cli.capsule.connect(capsuleId, {
                    privateKeyPath,
                    username,
                })

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
