/**
 * LOCAL CAPSULE INSTANCE
 *
 * CapsuleInstance implementation for same-process execution.
 * Wraps the local Capsule runtime with zero transport overhead.
 *
 * The Mind sees this as a regular CapsuleInstance - it has no visibility
 * that execution is local vs. remote.
 */

import type {
    CapsuleDef,
    CapsuleInstance,
    ExtractCapabilityNames,
    ExtractOperationNames,
    ExtractOperationParams,
    ExtractOperationReturn,
    StimulusHandler
} from "./types/mod.js"
import { CapsuleCore } from "./CapsuleCore.js"

/**
 * Create a local CapsuleInstance wrapping a Capsule runtime.
 *
 * This is the no-transport variant - the capsule runs in the same process
 * as the caller.
 *
 * Type-safe: Full type preservation for trigger/emit.
 *
 * @param def - Capsule definition
 * @returns CapsuleInstance with identical interface to remote variant
 */
export function LocalCapsuleInstance<
    TCapabilities extends readonly any[] = readonly any[],
    TStimulusMap extends Record<string, any> = Record<string, any>
>(
    def: CapsuleDef<TCapabilities, TStimulusMap>
): CapsuleInstance<CapsuleDef<TCapabilities, TStimulusMap>> {
    // Create the local runtime instance
    const capsule = CapsuleCore(def)

    // Return CapsuleInstance interface that delegates to local capsule
    return {
        describe() {
            return capsule.describe()
        },

        async boot(): Promise<void> {
            return await capsule.boot()
        },

        async shutdown(): Promise<void> {
            return await capsule.shutdown()
        },

        async trigger<
            CapName extends ExtractCapabilityNames<CapsuleDef<TCapabilities, TStimulusMap>>,
            OpName extends ExtractOperationNames<CapsuleDef<TCapabilities, TStimulusMap>, CapName>
        >(
            capability: CapName,
            operation: OpName,
            params: ExtractOperationParams<CapsuleDef<TCapabilities, TStimulusMap>, CapName, OpName>,
            signal?: AbortSignal
        ): Promise<ExtractOperationReturn<CapsuleDef<TCapabilities, TStimulusMap>, CapName, OpName>> {
            return await capsule.trigger(capability, operation, params, signal)
        },

        emit(stimulus: Parameters<typeof capsule.emit>[0]): void {
            return capsule.emit(stimulus)
        },

        onStimulus(handler: StimulusHandler): () => void {
            return capsule.onStimulus(handler)
        }
    }
}
