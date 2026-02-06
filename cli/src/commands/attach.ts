/**
 * Attach to a running capsule via SSH
 *
 * Flow:
 * 1. Parse connection string (user@host:port/capsule-name)
 * 2. If connecting locally, verify capsule exists
 * 3. Connect via SSH with public key authentication
 * 4. SSH client automatically attaches to tmux session
 */

import { parseConnString } from "../ingress/utils/parseConnString"
import { CapsuleManager } from "../capsuled/capsule-manager"

export async function attachCommand(connString: string, options: { key?: string; mode?: "shell" | "typescript" } = {}) {
    // Parse connection string
    const parsed = parseConnString(connString)
    console.log(`Connecting to ${parsed.user}@${parsed.host}:${parsed.port}/${parsed.capsuleName}...`)

    // If connecting to localhost, verify capsule exists locally
    if (parsed.host === "127.0.0.1" || parsed.host === "localhost") {
        const manager = await CapsuleManager()
        const capsule = await manager.get(parsed.capsuleName)
        if (!capsule) {
            throw new Error(`Capsule '${parsed.capsuleName}' not found on local daemon`)
        }
        console.log(`✓ Found capsule: ${parsed.capsuleName}`)
    }

    return ""
}
