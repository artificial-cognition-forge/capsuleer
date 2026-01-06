/**
 * TYPE EXTRACTORS
 *
 * Type-level helpers for extracting types from capsule definitions.
 * These enable type-safe operation invocations.
 */

import type { CapsuleDef } from "./capsule"
import type { OperationDef } from "./operation"

/**
 * Extract capability names from a capsule definition.
 * Type-level helper for deriving valid capability identifiers.
 */
export type ExtractCapabilityNames<T extends CapsuleDef<any, any>> = T["capabilities"][number]["name"]

/**
 * Extract the capability definition for a given capability name.
 */
export type ExtractCapability<
    T extends CapsuleDef<any, any>,
    CapName extends ExtractCapabilityNames<T>
> = Extract<T["capabilities"][number], { name: CapName }>

/**
 * Extract operation names for a given capability.
 * Type-level helper for deriving valid operation identifiers.
 */
export type ExtractOperationNames<
    T extends CapsuleDef<any, any>,
    CapName extends ExtractCapabilityNames<T>
> = keyof ExtractCapability<T, CapName>["operations"] & string

/**
 * Extract the operation definition for a given capability and operation.
 */
export type ExtractOperation<
    T extends CapsuleDef<any, any>,
    CapName extends ExtractCapabilityNames<T>,
    OpName extends ExtractOperationNames<T, CapName>
> = ExtractCapability<T, CapName>["operations"][OpName]

/**
 * Extract parameter type for a specific operation.
 */
export type ExtractOperationParams<
    T extends CapsuleDef<any, any>,
    CapName extends ExtractCapabilityNames<T>,
    OpName extends ExtractOperationNames<T, CapName>
> = ExtractOperation<T, CapName, OpName> extends OperationDef<infer TParams, any>
    ? TParams
    : never

/**
 * Extract return type for a specific operation.
 */
export type ExtractOperationReturn<
    T extends CapsuleDef<any, any>,
    CapName extends ExtractCapabilityNames<T>,
    OpName extends ExtractOperationNames<T, CapName>
> = ExtractOperation<T, CapName, OpName> extends OperationDef<any, infer TReturn>
    ? TReturn
    : never
