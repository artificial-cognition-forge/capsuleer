/**
 * METADATA TYPES
 *
 * Introspection metadata for capsules and their capabilities.
 */

/** Introspection metadata for the capsule */
export type CapsuleMetadata = {
    id: string
    name: string
    docs?: string
    capabilities: {
        name: string
        docs: string
        operations: {
            name: string
            docs: string
            signature: string
            kind: "call" | "stream"
        }[]
    }[]
    ssh?: {
        host: string
        port: number
        username: string
        publicKey: string
        publicKeyFingerprint: string
    }
    senses?: {
        name: string
        docs: string
        signature: string
    }[]
}
