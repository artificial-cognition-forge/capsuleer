import type { CapabilityDef, OperationsMap } from "../types/mod.js"

/**
 * Helper to define a capability with type preservation.
 * Returns input unchanged - pure identity function for type preservation.
 */
export function defineCapability<TOperations extends OperationsMap>(
    input: CapabilityDef<TOperations>
): CapabilityDef<TOperations> {
    return input
}
