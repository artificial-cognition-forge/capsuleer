import { exec } from "child_process"
import { promisify } from "util"
import tmux from "../capsuled/tmux"

const execAsync = promisify(exec)

export type SSHStatus = {
    status: string
    port: number
    clients: number
}

export type CapsuleerDeamonStatus = {
    running: boolean
    healthy: boolean
    ssh: SSHStatus
}

/** Check if OpenSSH daemon is running via systemctl */
async function isSSHDaemonRunning(): Promise<boolean> {
    try {
        // Try 'ssh' first (common on Debian/Ubuntu), fall back to 'sshd' (RedHat/CentOS)
        let result
        try {
            result = await execAsync("systemctl status ssh")
        } catch {
            result = await execAsync("systemctl status sshd")
        }

        return result.stdout.includes("active (running)")
    } catch {
        // If systemctl fails, SSH daemon is not running
        return false
    }
}

/** Check if SSH is actually listening on port 22 */
async function isSSHListening(): Promise<boolean> {
    try {
        const result = await execAsync("ss -tulpn | grep ':22'")
        return result.stdout.includes("LISTEN")
    } catch {
        // If ss command fails or port not found, SSH not listening
        return false
    }
}

/** Format health status into human-readable output */
function formatHealthOutput(status: CapsuleerDeamonStatus): string {
    const checkmark = ""
    const cross = ""
    const tmuxStatus = status.running ? checkmark : cross
    const sshServiceStatus = status.ssh.status === "running" ? checkmark : cross
    const sshListeningStatus = status.ssh.status === "running" ? checkmark : cross
    const capsuleSessionStatus = status.healthy ? checkmark : cross
    const overallStatus = status.healthy ? `${checkmark} Healthy` : `${cross} Unhealthy`

    return `
Daemon Health Status


Tmux Server
  Status:  ${tmuxStatus} ${status.running ? "Running" : "Stopped"}

Capsuleer Session
  Status:  ${capsuleSessionStatus} ${status.healthy ? "Active (capsuleerd_server)" : "Not found"}

SSH Server
  Service: ${sshServiceStatus} ${status.ssh.status === "running" ? "Running" : "Stopped"}
  Port ${status.ssh.port}: ${sshListeningStatus} ${status.ssh.status === "running" ? "Listening" : "Not listening"}


Overall: ${overallStatus}
`
}

/** Check the health of the Capsuleer daemon */
export async function checkHealth(): Promise<CapsuleerDeamonStatus> {
    try {
        // Check if SSH daemon is running and listening
        const sshDaemonRunning = await isSSHDaemonRunning()
        const sshListening = sshDaemonRunning ? await isSSHListening() : false

        // Tmux server is running if we can list sessions
        const sessions = await tmux.session.list()
        const tmuxRunning = sessions.length > 0

        // Only check session if tmux is running
        const hasSession = tmuxRunning ? await tmux.session.has("capsuleerd_server") : false

        const res = {
            running: tmuxRunning && sshListening,
            healthy: tmuxRunning && hasSession && sshListening,
            ssh: {
                status: sshListening ? "running" : "stopped",
                port: 22,
                clients: 0,
            },
        }

        console.log(formatHealthOutput(res))

        return res
    } catch (error) {
        // If we can't reach services, daemon is not running
        const res = {
            running: false,
            healthy: false,
            ssh: {
                status: "unknown",
                port: 0,
                clients: 0,
            },
        }

        console.log(formatHealthOutput(res))
        return res
    }
}
