import ssh from "../ingress/ssh/ssh"

/**
 * Standalone SSH server process.
 * Runs in a tmux window and handles all SSH connections.
 */
async function main() {
    try {
        console.log("[SSH Server] Starting...")
        await ssh.connect()
        console.log("[SSH Server] Ready")

        // Keep the process alive
        process.on("SIGTERM", async () => {
            console.log("[SSH Server] Received SIGTERM, shutting down...")
            await ssh.disconnect()
            process.exit(0)
        })

        process.on("SIGINT", async () => {
            console.log("[SSH Server] Received SIGINT, shutting down...")
            await ssh.disconnect()
            process.exit(0)
        })
    } catch (error) {
        console.error("[SSH Server] Fatal error:", error)
        process.exit(1)
    }
}

main()
