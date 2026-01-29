/**
 * CAPABILITY TYPES
 *
 * Defines capabilities as namespaces of related operations.
 */

import type { OperationsMap } from "./operation"

/**
 * A namespace of operations.
 * Generic over TOperations to preserve operation structure.
 */
export type CapabilityDef<TOperations extends OperationsMap = OperationsMap> = {
    /** Capability name (e.g. "tmux", "filesystem") */
    name: string
    /** Human-readable documentation */
    docs?: string
    /** Map of operation name → operation definition */
    operations: TOperations
}
