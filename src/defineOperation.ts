import type { OperationDef } from "./SPECIFICATION"

/**
 * Helper to define a type-safe operation.
 * Returns input unchanged - pure identity function for type preservation.
 */
export function defineOperation<TParams = unknown, TReturn = unknown>(
    input: OperationDef<TParams, TReturn>
): OperationDef<TParams, TReturn> {
    return input
}
