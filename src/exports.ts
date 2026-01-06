export { Capsule } from "./Capsule"
export * from "./defineCapability"
export * from "./defineMiddleware"
export * from "./defineOperation"

// Export types from SPECIFICATION (but not the duplicate function definitions)
export type {
    OperationInvocationContext,
    OperationExecutionContext,
    OperationHandler,
    OperationDef,
    OperationsMap,
    CapabilityDef,
    Stimulus,
    StimulusMap,
    StimulusHandler,
    SenseDef,
    MiddlewareResult,
    OperationMiddleware,
    CapsuleMiddleware,
    CapsuleState,
    LifecycleContext,
    LifecycleHooks,
    CapsuleDef,
    ExtractCapabilityNames,
    ExtractCapability,
    ExtractOperationNames,
    ExtractOperation,
    ExtractOperationParams,
    ExtractOperationReturn,
    CapsuleInstance,
    CapsuleMetadata
} from "./SPECIFICATION"