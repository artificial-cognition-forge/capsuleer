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

        const logFile = logFiles[0]! // Most recent (sorted in reverse)

        // Spawn tail -f process and capture output
        const proc = spawn(["tail", "-f", "-v", logFile], {
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
        })

        // Stream stdout to console in real-time
        const stdoutReader = proc.stdout.getReader()
        const decoder = new TextDecoder()

            ; (async () => {
                try {
                    while (true) {
                        const { done, value } = await stdoutReader.read()
                        if (done) break
                        const text = decoder.decode(value, { stream: true })
                        process.stdout.write(text)
                    }
                } finally {
                    stdoutReader.releaseLock()
                }
            })()

        // Stream stderr to console in real-time
        const stderrReader = proc.stderr.getReader()
        const stderrDecoder = new TextDecoder()

            ; (async () => {
                try {
                    while (true) {
                        const { done, value } = await stderrReader.read()
                        if (done) break
                        const text = stderrDecoder.decode(value, { stream: true })
                        process.stderr.write(text)
                    }
                } finally {
                    stderrReader.releaseLock()
                }
            })()

        // Wait for process to exit
        await proc.exited
    },
}
