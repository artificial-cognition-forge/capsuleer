import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const PID_FILE = join(homedir(), '.capsuleer', 'daemon.pid')

/**
 * PID Manager - Track daemon process IDs
 *
 * Stores the daemon PID to a file so we can kill it cleanly later.
 */
export const pidManager = {
    /**
     * Save the daemon PID to disk
     */
    async savePID(pid: number): Promise<void> {
        const dir = join(homedir(), '.capsuleer')
        // Ensure directory exists
        try {
            await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }))
        } catch {
            // Directory might already exist
        }
        writeFileSync(PID_FILE, pid.toString())
    },

    /**
     * Read the stored daemon PID from disk
     */
    async getPID(): Promise<number | null> {
        if (!existsSync(PID_FILE)) {
            return null
        }
        try {
            const content = readFileSync(PID_FILE, 'utf-8').trim()
            const pid = parseInt(content, 10)
            return isNaN(pid) ? null : pid
        } catch {
            return null
        }
    },

    /**
     * Check if a process with the stored PID is still running
     */
    async isRunning(): Promise<boolean> {
        const pid = await pidManager.getPID()
        if (!pid) return false

        try {
            // Sending signal 0 checks if process exists without killing it
            process.kill(pid, 0)
            return true
        } catch {
            return false
        }
    },

    /**
     * Kill the daemon process by PID
     */
    async killDaemon(): Promise<void> {
        const pid = await pidManager.getPID()
        if (!pid) {
            return
        }

        try {
            // First try SIGTERM for graceful shutdown
            process.kill(pid, 'SIGTERM')

            // Wait a bit for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 1000))

            // If still running, force kill with SIGKILL
            if (await pidManager.isRunning()) {
                process.kill(pid, 'SIGKILL')
            }
        } catch (err: any) {
            // Process might already be dead, that's fine
            if (err.code !== 'ESRCH') {
                throw err
            }
        } finally {
            // Clean up PID file
            await pidManager.clearPID()
        }
    },

    /**
     * Clear the stored PID file
     */
    async clearPID(): Promise<void> {
        try {
            if (existsSync(PID_FILE)) {
                unlinkSync(PID_FILE)
            }
        } catch {
            // Ignore errors
        }
    },
}
