/**
 * LIFECYCLE TYPES
 *
 * Defines capsule lifecycle state and hooks.
 */

import type { StimulusMap } from "./stimulus"
import type { CapsuleInstance } from "./capsule"
import type { CapsuleDef } from "./capsule"

/**
 * Capsule lifecycle state.
 * Enforces legal state transitions.
 *
 * INVARIANT: created → booted → shutdown (one-way only)
 * INVARIANT: trigger() is illegal before boot and after shutdown
 * INVARIANT: emit() must no-op or throw if capsule is not booted
 *
 * NOTE: We do NOT create separate BootedCapsuleInstance type because:
 * 1. It would require boot() to return a new type (breaks ergonomics)
 * 2. Capsule references may be held by transport layers before boot
 * 3. Runtime enforcement is clearer and more predictable than type-level state machines
 * 4. TypeScript doesn't track state transitions across async boundaries well
 *
 * Instead: Runtime guards throw on illegal calls + clear documentation.
 */
export type CapsuleState = "created" | "booted" | "shutdown"

/**
 * Context provided to lifecycle hooks.
 *
 * NON-GOALS (forbidden):
 * - Lifecycle hooks MUST NOT invoke operations
 * - Lifecycle hooks MAY emit stimuli (e.g., from boot to set up streams)
 */
export type LifecycleContext<TStimulusMap extends StimulusMap = StimulusMap> = {
    /**
     * Reference to a limited capsule interface (only emit).
     * Type-safe when TStimulusMap is provided.
     */
    capsule: Pick<CapsuleInstance<CapsuleDef<any, TStimulusMap>>, "emit">
}

/** Lifecycle hooks */
export type LifecycleHooks<TStimulusMap extends StimulusMap = StimulusMap> = {
    /** Called when capsule connects */
    boot?: (ctx: LifecycleContext<TStimulusMap>) => Promise<void>
    /** Called when capsule disconnects */
    shutdown?: (ctx: LifecycleContext<TStimulusMap>) => Promise<void>
}
