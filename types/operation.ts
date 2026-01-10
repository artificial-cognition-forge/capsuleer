/**
 * OPERATION TYPES
 *
 * Defines the core operation types including invocation context,
 * execution context, handlers, and operation definitions.
 */

import type { StimulusMap, Stimulus } from "./stimulus"

/**
 * Invocation context - metadata about the operation being invoked.
 * This is what middleware sees. Middleware MUST NOT have access to
 * execution affordances (emit, capsule ref).
 */
export type OperationInvocationContext<TParams = unknown> = {
    /** Capability name being invoked */
    capability: string
    /** Operation name being invoked */
    operation: string
    /** Parameters passed to the operation */
    params: TParams
    /** Abort signal for cancellation */
    signal: AbortSignal
}

/**
 * Execution context - affordances available to operation handlers.
 * Handlers get execution capabilities that middleware must not access.
 *
 * INTERRUPTIBILITY:
 * - signal MUST be checked by long-running handlers
 * - Runtime MUST abort handlers when signal is aborted
 * - Abort reasons: "user" (explicit cancel), "system" (shutdown), "timeout"
 */
export type OperationExecutionContext<TStimulusMap extends StimulusMap = StimulusMap> = {
    /**
     * Abort signal for cancellation.
     *
     * INVARIANT: Handlers MUST check signal.aborted for long-running work
     * INVARIANT: Runtime MUST propagate abort to handlers
     */
    signal: AbortSignal

    /**
     * Emit a stimulus event (capsule → server).
     * If TStimulusMap is provided, only valid sense/data pairs are allowed.
     */
    emit<K extends keyof TStimulusMap & string>(
        stimulus: Omit<Stimulus<TStimulusMap[K]>, "timestamp"> & { sense: K }
    ): void
    emit(stimulus: Omit<Stimulus, "timestamp">): void
}

/**
 * Handler function for a single operation.
 * Receives execution context + typed params.
 *
 * NON-GOALS (forbidden):
 * - Handlers MUST NOT invoke other operations
 * - Handlers MUST NOT access middleware
 * - Handlers MUST NOT directly access capsule lifecycle
 *
 * INTERRUPTIBILITY:
 * - Handler MUST respect ctx.signal for long-running operations
 * - Runtime will abort handler if signal is aborted
 */
export type OperationHandler<
    TParams = unknown,
    TReturn = unknown,
    TStimulusMap extends StimulusMap = StimulusMap
> = (
    ctx: OperationExecutionContext<TStimulusMap> & { params: TParams }
) => Promise<TReturn>

/** Definition of a single operation */
export type OperationDef<TParams = unknown, TReturn = unknown> = {
    /** Operation name */
    name: string
    /** Human-readable documentation */
    docs: string
    /** TypeScript signature for introspection */
    signature: string
    /** Execution shape: "call" for finite operations, "stream" for ongoing operations. Defaults to "call". */
    kind?: "call" | "stream"
    /** Optional operation-level middleware */
    middleware?: import("./middleware.ts").OperationMiddleware<TParams>[]
    /** The operation handler */
    handler: OperationHandler<TParams, TReturn>
}

/**
 * Typed map of operations.
 * Preserves operation names and param/return types at the type level.
 */
export type OperationsMap = Record<string, OperationDef<any, any>>
