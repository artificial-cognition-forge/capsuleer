/**
 * CAPSULE TYPE SYSTEM
 *
 * Complete type system for Capsules - organized into logical modules.
 *
 * This file provides a barrel export for all type modules.
 */

// Operation types
export type {
    OperationInvocationContext,
    OperationExecutionContext,
    OperationHandler,
    OperationDef,
    OperationsMap
} from "./operation"

// Stimulus types
export type {
    Stimulus,
    StimulusMap,
    StimulusHandler,
    SenseDef
} from "./stimulus"

// Middleware types
export type {
    MiddlewareResult,
    OperationMiddleware,
    CapsuleMiddleware
} from "./middleware"

// Capability types
export type {
    CapabilityDef
} from "./capability"

// Lifecycle types
export type {
    CapsuleState,
    LifecycleContext,
    LifecycleHooks
} from "./lifecycle"

// Metadata types
export type {
    CapsuleMetadata
} from "./metadata"

// Capsule core types
export type {
    CapsuleDef,
    CapsuleInstance
} from "./capsule"

// Type extractors
export type {
    ExtractCapabilityNames,
    ExtractCapability,
    ExtractOperationNames,
    ExtractOperation,
    ExtractOperationParams,
    ExtractOperationReturn
} from "./extractors"
