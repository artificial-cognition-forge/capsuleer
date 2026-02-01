type CapsuleSpec = {
    id: string
    cwd: string
    command: string
    env?: Record<string, string>
    autostart?: boolean
    capabilities: CapabilitySet
}

type CapsuleState = {
    status: "online" | "offline" | "crashed"
    pid?: number        // optional, informational
    startedAt?: number
}
type Capsule = {
    spec: CapsuleSpec
    state: CapsuleState
    session: string
}

type CapabilitySet = {
    filesystem?: {
        read?: string[]
        write?: string[]
    }
    network?: {
        outbound?: boolean
        inbound?: boolean
    }
    secrets?: string[]
}

/** 
 * Capsule Manager
 * 
 * Manages capsules and their lifecycle.
 * 
 * **role**
 * - Mediate capsule requests
 * - route network requests to correct capsule
 * - manage capsule lifecycle
 */
export function CapsuleManager() {

}