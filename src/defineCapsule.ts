import type { CapsuleBlueprint, DefineCapsuleInput } from "./Capsule"



/**
 * The API: define a capsule blueprint
 */
export type DefineCapsuleFn = (blueprint: CapsuleBlueprint) => CapsuleBlueprint

/** Define capsule */
export function defineCapsule(input: DefineCapsuleInput): CapsuleBlueprint {
    return {
        name: input.name,
        description: input.description,
        env: input.env || {},
        boot: input.boot || (() => Promise.resolve()),
        shutdown: input.shutdown || (() => Promise.resolve()),
        scope: [],
    }
}

export type CapsuleState = {
    sessionName: string
    started: boolean
}

export type CapsuleSpawnOptions = {
    name: string
    endpoint: string
    host: string
    port: number
    pty?: boolean
}

export type CapsuleAddress = {
    name: string
    endpoint: string
    host: string
    port: number
}

export type CapsuleProcess = {
    id: string
    runtime: "shell" | "typescript"
    address: CapsuleAddress
} & Bun.Subprocess

