/**
 * STIMULUS TYPES
 *
 * Defines sensory events emitted by the capsule.
 * Stimuli are ambient and unstructured, but we anchor provenance.
 */

/**
 * A sensory event emitted by the capsule.
 * Stimuli are ambient and unstructured, but we anchor provenance.
 *
 * INVARIANT: Stimuli flow capsule → server only.
 * INVARIANT: Stimuli are NOT responses to operations (use return values for that).
 */
export type Stimulus<TData = unknown> = {
    /** Sense identifier (e.g. "tmux:output", "fs:change") */
    sense: string
    /** Payload data */
    data: TData
    /** Provenance metadata - where did this stimulus originate? */
    source?: {
        /** Capability that emitted this stimulus (if from operation handler) */
        capability?: string
        /** Operation that emitted this stimulus (if from operation handler) */
        operation?: string
    }
    /** Timestamp (automatically added by runtime) */
    timestamp?: number
}

/**
 * Optional typed stimulus map for type-safe emit().
 * Maps sense identifiers to their payload types.
 *
 * Example:
 * ```
 * type MyStimuli = {
 *   "tmux:output": { sessionId: string; data: string }
 *   "tmux:session:created": { id: string; name: string }
 * }
 * ```
 */
export type StimulusMap = Record<string, any>

/** Handler for stimulus events */
export type StimulusHandler<TStimulusMap extends StimulusMap = StimulusMap> = (
    stimulus: Stimulus
) => void

/** Declaration of a sense (for introspection) */
export type SenseDef = {
    /** Sense identifier */
    name: string
    /** Human-readable description */
    docs: string
    /** TypeScript type signature for the data */
    signature: string
}
