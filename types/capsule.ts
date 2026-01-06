/**
 * CAPSULE TYPES
 *
 * Core capsule configuration and instance types.
 */

import type { CapabilityDef } from "./capability"
import type { StimulusMap, SenseDef, StimulusHandler, Stimulus } from "./stimulus"
import type { CapsuleMiddleware } from "./middleware"
import type { LifecycleHooks } from "./lifecycle"
import type { CapsuleMetadata } from "./metadata"
import type {
    ExtractCapabilityNames,
    ExtractOperationNames,
    ExtractOperationParams,
    ExtractOperationReturn
} from "./extractors"

/**
 * Configuration for creating a capsule.
 * Generic over TCapabilities and TStimulusMap to enable type-safe trigger() and emit().
 */
export type CapsuleDef<
    TCapabilities extends readonly CapabilityDef<any>[] = readonly CapabilityDef<any>[],
    TStimulusMap extends StimulusMap = StimulusMap
> = {
    /** Capsule name */
    name: string
    /** Human-readable documentation */
    docs?: string
    /** Declared capabilities */
    capabilities: TCapabilities
    /** Declared senses (for introspection) */
    senses?: SenseDef[]
    /** Capsule-level middleware */
    middleware?: CapsuleMiddleware[]
    /** Lifecycle hooks */
    hooks?: LifecycleHooks<TStimulusMap>
}

/**
 * The runtime capsule instance.
 *
 * Generic over TCapsuleDef to enable type-safe trigger() and emit() calls.
 *
 * RUNTIME INVARIANTS (to be enforced in implementation):
 * - trigger() MUST throw if called before boot() or after shutdown()
 * - emit() MUST no-op or throw if called before boot() or after shutdown()
 * - boot() MUST be idempotent (calling twice is safe)
 * - shutdown() MUST be idempotent (calling twice is safe)
 *
 * INTERRUPTIBILITY:
 * - trigger() accepts optional AbortSignal
 * - Runtime MUST propagate signal to middleware and handlers
 * - Runtime MUST abort in-flight handlers when signal is aborted
 * - Abort reasons: "user" (explicit), "system" (shutdown), "timeout"
 */
export type CapsuleInstance<
    TCapsuleDef extends CapsuleDef<any, any> = CapsuleDef<any, any>
> = {
    /** Get capsule metadata */
    describe(): CapsuleMetadata

    /**
     * Start the capsule (runs boot hook).
     * MUST transition state: created → booted
     * MUST be idempotent.
     */
    boot(): Promise<void>

    /**
     * Stop the capsule (runs shutdown hook).
     * MUST transition state: booted → shutdown
     * MUST be idempotent.
     * MUST abort all in-flight operations.
     */
    shutdown(): Promise<void>

    /**
     * Trigger an operation invocation (server → capsule).
     * Fully type-safe when TCapsuleDef is concrete.
     *
     * RUNTIME INVARIANT: MUST throw if state is not "booted"
     * TYPE INVARIANT: capability ∈ ExtractCapabilityNames<TCapsuleDef>
     * TYPE INVARIANT: operation ∈ ExtractOperationNames<TCapsuleDef, capability>
     * TYPE INVARIANT: params matches ExtractOperationParams<TCapsuleDef, capability, operation>
     * TYPE INVARIANT: return type matches ExtractOperationReturn<TCapsuleDef, capability, operation>
     */
    trigger<
        CapName extends ExtractCapabilityNames<TCapsuleDef>,
        OpName extends ExtractOperationNames<TCapsuleDef, CapName>
    >(
        capability: CapName,
        operation: OpName,
        params: ExtractOperationParams<TCapsuleDef, CapName, OpName>,
        signal?: AbortSignal
    ): Promise<ExtractOperationReturn<TCapsuleDef, CapName, OpName>>

    /**
     * Emit a stimulus event (used internally by operation handlers and lifecycle hooks).
     *
     * RUNTIME INVARIANT: MUST no-op or throw if state is not "booted"
     * RUNTIME INVARIANT: MUST add timestamp
     * RUNTIME INVARIANT: MUST add source provenance when called from operation
     *
     * Type-safe when TStimulusMap is defined in TCapsuleDef.
     */
    emit<K extends keyof TCapsuleDef extends CapsuleDef<any, infer TStimulusMap>
        ? keyof TStimulusMap & string
        : string>(
            stimulus: Omit<Stimulus, "timestamp"> & { sense: K }
        ): void
    emit(stimulus: Omit<Stimulus, "timestamp">): void

    /**
     * Subscribe to stimulus events (for transport layer).
     * Returns unsubscribe function.
     */
    onStimulus(handler: StimulusHandler): () => void
}
