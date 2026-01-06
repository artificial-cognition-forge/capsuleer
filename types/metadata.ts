/**
 * METADATA TYPES
 *
 * Introspection metadata for capsules and their capabilities.
 */

/** Introspection metadata for the capsule */
export type CapsuleMetadata = {
    name: string
    docs?: string
    capabilities: {
        name: string
        docs: string
        operations: {
            name: string
            docs: string
            signature: string
        }[]
    }[]
    senses?: {
        name: string
        docs: string
        signature: string
    }[]
}
