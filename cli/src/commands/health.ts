import { join } from "path"
import { homedir } from "os"

const PID_FILE = join(homedir(), ".capsuleer", "daemon.pid")
const WS_PORT = 3011

export type CapsuleerDeamonStatus = {
    running: boolean
    ws: { reachable: boolean; port: number }
    healthy: boolean
}

/** Check if the daemon process is alive via pidfile */
async function isDaemonRunning(): Promise<boolean> {
    try {
        const pid = parseInt(await Bun.file(PID_FILE).text())
        if (isNaN(pid)) return false
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

/** Check if the WS server is reachable */
async function isWsReachable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            ws.close()
            resolve(false)
        }, 2000)

        const ws = new WebSocket(`ws://localhost:${port}`)
        ws.onopen = () => {
            clearTimeout(timeout)
            ws.close()
            resolve(true)
        }
        ws.onerror = () => {
            clearTimeout(timeout)
            resolve(false)
        }
    })
}

function formatHealthOutput(status: CapsuleerDeamonStatus): string {
    const ok = (v: boolean) => v ? "✓" : "✗"

    return `
Daemon Health

  Process:  ${ok(status.running)} ${status.running ? "Running" : "Stopped"}
  WS :${status.ws.port}  ${ok(status.ws.reachable)} ${status.ws.reachable ? "Reachable" : "Unreachable"}

  Overall:  ${ok(status.healthy)} ${status.healthy ? "Healthy" : "Unhealthy"}
`
}

/** Check the health of the Capsuleer daemon */
export async function checkHealth(): Promise<CapsuleerDeamonStatus> {
    const [running, wsReachable] = await Promise.all([
        isDaemonRunning(),
        isWsReachable(WS_PORT),
    ])

    const status: CapsuleerDeamonStatus = {
        running,
        ws: { reachable: wsReachable, port: WS_PORT },
        healthy: running && wsReachable,
    }

    console.log(formatHealthOutput(status))

    return status
}
