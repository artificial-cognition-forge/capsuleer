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
    senses?: {
        name: string
        docs: string
        signature: string
    }[]
}
