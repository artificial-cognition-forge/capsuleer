import { storage } from "../storage/storage"
import { spawn } from "bun"

export const tail = {
    /**
     * Tail the most recent daemon log file
     *
     * Streams the most recently created JSONL log file using `tail -f`
     */
    async run() {
        // Get the most recent log file
        const logFiles = await storage.log.list()

        if (logFiles.length === 0) {
            console.log("No daemon logs found. Start the daemon with 'capsuleer daemon start'")
            return
        }

        const logFile = logFiles[0] // Most recent (sorted in reverse)
        console.log(`Tailing ${logFile}`)
        console.log("Press Ctrl+C to stop\n")

        // Spawn tail -f process
        const proc = spawn(["tail", "-f", logFile], {
            stdio: ["inherit", "inherit", "inherit"],
        })

        // Wait for process to exit
        await proc.exited
    },
}
