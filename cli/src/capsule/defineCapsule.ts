// capsule.ts
export type FileSystemPolicy = {
    /** Glob patterns for allowed paths */
    read?: string[]
    /** Glob patterns for allowed paths */
    write?: string[]

    /** Glob patterns for allowed paths */
    execute?: string[]
}

export type NetworkPolicy = {
    /** Allow outbound network connections */
    outbound?: boolean

    /** Allow inbound network connections */
    inbound?: boolean
}

export type ToolsPolicy = {
    /** Allowed binaries */
    allowed?: string[]
    /** Denylist of binaries */
    denied?: string[]
}

export type ResourceLimits = {
    cpuPercent?: number
    memoryMB?: number
    maxProcesses?: number
}

export type CapsulePolicy = {
    fs?: FileSystemPolicy
    network?: NetworkPolicy
    tools?: ToolsPolicy
    resources?: ResourceLimits
}

/**
 * The main Capsule blueprint type
 */
export type CapsuleBlueprint = {
    name: string                   // capsule name
    description?: string
    policy: CapsulePolicy
    env: Record<string, string>
    bootstrap: string[]
}

export type DefineCapsuleInput = {
    name: string
    description?: string
    policy: CapsulePolicy
    env?: Record<string, string>
    bootstrap?: string[]
}

/**
 * The API: define a capsule blueprint
 */
export type DefineCapsuleFn = (blueprint: CapsuleBlueprint) => CapsuleBlueprint

/** Define capsule */
export function defineCapsule(input: DefineCapsuleInput): CapsuleBlueprint {
    return {
        name: input.name,
        description: input.description,
        policy: input.policy || {},
        env: input.env || {},
        bootstrap: input.bootstrap || [],
    }
}

export type CapsuleInstance = {
    id: string                      // unique capsule ID
    tmuxSessionId: string
    blueprint: CapsuleBlueprint

    /** process id */
    pid: number

    /** Network connections. */
    clients: Set<string>

    resources: {
        cpuPercent: number
        memoryMB: number
    }

    network: {
        outbound: number
        inbound: number
    }

    status: "starting" | "running" | "paused" | "stopped"
    lastEventIndex: number

    stop: () => Promise<void>
}