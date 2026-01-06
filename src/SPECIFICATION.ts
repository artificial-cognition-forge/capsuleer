/**
 * CAPSULE TYPE SYSTEM (Final Iteration)
 *
 * This file defines the complete type system for Capsules.
 * Implementation is deferred - these types establish invariants first.
 *
 * KEY ABSTRACTIONS:
 * - Operation: A single function call with typed params/returns
 * - Capability: A namespace of related operations
 * - Stimulus: Ambient sensory events flowing capsule → server
 * - Middleware: Intercept/transform/reject at operation or capsule level
 * - Capsule: The complete runtime with lifecycle, capabilities, and stimuli
 *
 * ARCHITECTURAL WALLS (enforced via types):
 * ✅ Middleware sees only invocation context (NOT execution affordances)
 * ✅ Middleware transformations must preserve param types
 * ✅ Handlers cannot access middleware
 * ✅ Lifecycle hooks have limited capsule access (emit only)
 * ✅ Stimuli flow one direction only (capsule → server)
 * ✅ trigger() only accepts valid capability/operation pairs
 * ✅ trigger() params/returns are fully type-checked
 * ✅ emit() can be constrained to declared stimuli (via TStimulusMap)
 * ✅ Interruptibility is explicit (AbortSignal everywhere)
 *
 * WHAT CANNOT BE EXPRESSED INCORRECTLY:
 * - Invalid operation invocations (TypeScript catches them)
 * - Wrong param or return types (TypeScript catches them)
 * - Middleware accessing execution context (separate types prevent it)
 * - Middleware returning wrong param types (generics enforce it)
 * - Handlers bypassing middleware (architecture prevents it)
 *
 * WHAT REMAINS RUNTIME-ONLY:
 * - State transition enforcement (created → booted → shutdown)
 * - Middleware rejection logic
 * - Stimulus timestamp injection
 * - Source provenance injection
 * - AbortSignal propagation
 *
 * WHAT IS INTENTIONALLY FLEXIBLE:
 * - Stimulus payload structure (untyped by default, optionally typed)
 * - Capability/operation names (strings, but constrained by generics)
 * - Middleware composition patterns
 *
 * See sections below:
 * - INVARIANTS SUMMARY (line ~510)
 * - WHAT THIS DESIGN ENABLES (line ~572)
 */

// ============================================================================
// OPERATION TYPES
// ============================================================================

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
    /** Optional operation-level middleware */
    middleware?: OperationMiddleware<TParams>[]
    /** The operation handler */
    handler: OperationHandler<TParams, TReturn>
}

/** Helper to define a type-safe operation */
export function defineOperation<TParams = unknown, TReturn = unknown>(
    input: OperationDef<TParams, TReturn>
): OperationDef<TParams, TReturn> {
    return input
}

// ============================================================================
// CAPABILITY TYPES
// ============================================================================

/**
 * Typed map of operations.
 * Preserves operation names and param/return types at the type level.
 */
export type OperationsMap = Record<string, OperationDef<any, any>>

/**
 * A namespace of operations.
 * Generic over TOperations to preserve operation structure.
 */
export type CapabilityDef<TOperations extends OperationsMap = OperationsMap> = {
    /** Capability name (e.g. "tmux", "filesystem") */
    name: string
    /** Human-readable documentation */
    docs: string
    /** Map of operation name → operation definition */
    operations: TOperations
}

/** Helper to define a capability with type preservation */
export function defineCapability<TOperations extends OperationsMap>(
    input: CapabilityDef<TOperations>
): CapabilityDef<TOperations> {
    return input
}

// ============================================================================
// STIMULUS TYPES
// ============================================================================

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

// ============================================================================
// MIDDLEWARE TYPES
// ============================================================================

/**
 * Result of middleware execution.
 * Generic over TParams to ensure transforms preserve type agreement.
 *
 * NON-GOALS (forbidden):
 * - Middleware MUST NOT emit stimuli
 * - Middleware MUST NOT invoke operations
 * - Middleware MUST NOT access execution context
 */
export type MiddlewareResult<TParams> =
    | { type: "accept" }
    | { type: "reject"; reason: string }
    | { type: "transform"; params: TParams }

/**
 * Operation-level middleware.
 * Generic over TParams - transformations must preserve param type.
 *
 * INVARIANT: Middleware sees only invocation metadata, never execution affordances.
 * INVARIANT: Transform results must be type-compatible with operation params.
 */
export type OperationMiddleware<TParams = unknown> = (
    ctx: OperationInvocationContext<TParams>
) => Promise<MiddlewareResult<TParams>>

/**
 * Capsule-level middleware (runs on all operations).
 * Must work with unknown params since it runs across all operations.
 */
export type CapsuleMiddleware = OperationMiddleware<unknown>

/** Helper to define middleware */
export function defineMiddleware<TParams = unknown>(input: {
    name: string
    docs: string
    handler: OperationMiddleware<TParams>
}): OperationMiddleware<TParams> {
    return input.handler
}

// ============================================================================
// LIFECYCLE TYPES
// ============================================================================

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

// ============================================================================
// CAPSULE TYPES
// ============================================================================

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
/** Remote membrane for agent embodyment. */
// ============================================================================
// METADATA TYPES
// ============================================================================

/** Introspection metadata for the capsule */
export type CapsuleMetadata = {
    name: string
    docs?: string
    capabilities: {
        name: string
        docs: string
        operations: {
            name: string
            docs: string
            signature: string
        }[]
    }[]
    senses?: {
        name: string
        docs: string
        signature: string
    }[]
}

// ============================================================================
// MAIN CAPSULE FACTORY
// ============================================================================

/**
 * Create a capsule instance.
 *
 * The returned instance is fully type-safe:
 * - trigger() only accepts valid capability/operation pairs
 * - params and returns are type-checked
 * - emit() is constrained to declared stimuli (if TStimulusMap provided)
 *
 * TODO: Implementation must enforce all runtime invariants documented below.
 */
export function Capsule<
    TCapabilities extends readonly CapabilityDef<any>[] = readonly CapabilityDef<any>[],
    TStimulusMap extends StimulusMap = StimulusMap
>(
    def: CapsuleDef<TCapabilities, TStimulusMap>
): CapsuleInstance<CapsuleDef<TCapabilities, TStimulusMap>> {
    // TODO: Implementation will go here
    // TODO: Track internal state (CapsuleState)
    // TODO: Enforce state transitions (created → booted → shutdown)
    // TODO: Guard trigger() and emit() based on state
    // TODO: Run middleware chain on trigger()
    // TODO: Handle middleware rejection (stop execution, don't call handler)
    // TODO: Handle middleware transformation (pass transformed params to handler)
    // TODO: Add timestamp to emitted stimuli
    // TODO: Add source provenance when operations emit stimuli
    // TODO: Propagate AbortSignal to middleware and handlers
    // TODO: Abort in-flight operations on shutdown
    throw new Error("Not implemented")
}

// ============================================================================
// INVARIANTS SUMMARY
// ============================================================================

/**
 * TYPE-LEVEL INVARIANTS (enforced by TypeScript):
 *
 * 1. Middleware cannot access execution context (emit, capsule ref)
 *    - OperationInvocationContext vs OperationExecutionContext separation
 *
 * 2. Middleware transformations must preserve param types
 *    - MiddlewareResult<TParams> is generic over TParams
 *    - Transform must return { params: TParams }
 *
 * 3. Handlers cannot access middleware
 *    - Handler signature only receives OperationExecutionContext
 *
 * 4. Lifecycle hooks have limited capsule access
 *    - LifecycleContext only provides Pick<CapsuleInstance, "emit">
 *
 * 5. Stimulus must include sense identifier and data
 *    - Stimulus<TData> structure is enforced
 *
 * RUNTIME INVARIANTS (must be enforced in implementation):
 *
 * 1. State transitions are one-way: created → booted → shutdown
 *    - boot() transitions created → booted
 *    - shutdown() transitions booted → shutdown
 *    - Both must be idempotent
 *
 * 2. trigger() is illegal unless state is "booted"
 *    - Must throw or reject if called in "created" or "shutdown" state
 *
 * 3. emit() must no-op or throw unless state is "booted"
 *    - Prevents stimuli leaking during wrong lifecycle phase
 *
 * 4. Middleware rejection stops operation execution
 *    - If middleware returns { type: "reject" }, handler must not run
 *
 * 5. Stimuli must have timestamp added by runtime
 *    - emit() receives Omit<Stimulus, "timestamp">
 *    - Runtime adds timestamp before forwarding to subscribers
 *
 * 6. Source provenance should be added automatically when operations emit
 *    - Runtime should inject { source: { capability, operation } }
 *
 * UNENFORCED INVARIANTS (social contracts, documented but not checked):
 *
 * 1. Operations MUST NOT invoke other operations
 *    - No type-level or runtime check (would require complex tracking)
 *    - Documented in NON-GOALS comments
 *
 * 2. Middleware MUST NOT emit stimuli
 *    - Type-level enforcement via no emit() in OperationInvocationContext
 *
 * 3. Lifecycle hooks MUST NOT invoke operations
 *    - Partially enforced: hooks don't receive trigger()
 *    - Could still be bypassed with external reference
 *
 * 4. Capability/operation identity validation
 *    - NOW ENFORCED: trigger() uses generics to constrain capability/operation pairs
 *    - Type extraction helpers work at compile time
 *    - Invalid invocations are caught by TypeScript
 */

// ============================================================================
// WHAT THIS DESIGN EXPLICITLY ENABLES
// ============================================================================

/**
 * This type system is designed to enable specific architectural goals.
 * These are not abstractions for their own sake—they directly support
 * the security and cognitive properties of the Capsule runtime.
 *
 * 1. GRADED EMBODIMENT
 *    Capsules allow intelligence to interact with the world at varying
 *    levels of authority and sensory richness:
 *    - Minimal capsule: filesystem read-only + logs
 *    - Rich capsule: terminal, filesystem, network, sensors
 *    - The mind doesn't decide what it can do—the capsule does.
 *
 * 2. SENSORY REDACTION VIA MIDDLEWARE
 *    Middleware can intercept operations before execution and:
 *    - Reject based on policy (e.g., "no network on weekends")
 *    - Transform inputs (e.g., redact PII from file paths)
 *    - Rate-limit or audit without touching handlers
 *    This creates a policy enforcement layer separate from capability logic.
 *
 * 3. INTERRUPTIBLE COGNITION
 *    All operations support cancellation via AbortSignal:
 *    - User can interrupt in-flight operations
 *    - System can abort on shutdown
 *    - Timeout policies can be applied uniformly
 *    Prevents runaway execution without per-operation cancellation logic.
 *
 * 4. SANDBOXED AGENCY
 *    The type system prevents:
 *    - Operations invoking other operations (no hidden call chains)
 *    - Middleware accessing execution affordances (no side effects)
 *    - Handlers bypassing middleware (no policy violations)
 *    The mind interacts through a constrained, auditable surface.
 *
 * 5. STIMULUS-RESPONSE SEPARATION
 *    Operation results ≠ ambient stimuli:
 *    - Return values: synchronous, request-scoped
 *    - Stimuli: asynchronous, ambient sensory streams
 *    This prevents LLMs from confusing "what I asked for" with
 *    "what the world is showing me."
 *
 * 6. TRANSPORT-AGNOSTIC AUTHORITY
 *    Capsules don't know about:
 *    - WebSockets, HTTP, IPC, or any transport
 *    - Authentication, sessions, or connection state
 *    Authority is encoded in capabilities, not transport.
 *    This enables testing, mocking, and transport migration without
 *    changing security boundaries.
 *
 * 7. TYPE-SAFE OPERATION INVOCATION
 *    trigger() is fully type-checked:
 *    - Invalid capability names are compile errors
 *    - Invalid operation names are compile errors
 *    - Wrong param types are compile errors
 *    - Wrong return type assumptions are compile errors
 *    This prevents malformed invocations before they reach runtime.
 *
 * SECURITY PROPERTIES (Type-Level Enforcement):
 *
 * Could an LLM trying to escape the sandbox:
 * - Invoke operations it shouldn't? NO (middleware can reject)
 * - Call operations outside the capsule? NO (no reference to external ops)
 * - Bypass policy checks? NO (middleware runs before handlers)
 * - Emit stimuli without provenance? NO (runtime adds source)
 * - Access execution context from middleware? NO (separate types)
 * - Continue after cancellation? NO (signal propagates + runtime aborts)
 * - Invoke with wrong types? NO (TypeScript prevents it)
 *
 * If you can answer "yes" to any of these, the type system needs tightening.
 */

// ============================================================================
// USAGE EXAMPLE (for API exploration)
// ============================================================================

async function _example() {
    // Capsule-level middleware (works with unknown params)
    const authMiddleware = defineMiddleware({
        name: "auth",
        docs: "Validates authentication tokens",
        async handler({ params, capability, operation, signal }) {
            // Example: check if user has permission
            const hasPermission = true // some auth check
            if (!hasPermission) {
                return { type: "reject", reason: "Unauthorized" }
            }
            // Can transform params (must preserve type)
            return { type: "accept" }
        }
    })

    const tmux = defineCapability({
        name: "tmux",
        docs: "Terminal multiplexer operations",
        operations: {
            create: defineOperation<{ sessionName: string }, { id: string }>({
                name: "create",
                docs: "Create a new tmux session",
                signature: "declare function create(options: { sessionName: string }): Promise<{ id: string }>",
                async handler({ params, emit, signal }) {
                    // Create tmux session
                    const sessionId = "session-123"

                    // Emit stimulus event (provenance added automatically by runtime)
                    emit({
                        sense: "tmux:session:created",
                        data: { id: sessionId, name: params.sessionName }
                    })

                    return { id: sessionId }
                }
            }),

            send: defineOperation<{ sessionId: string; command: string }, void>({
                name: "send",
                docs: "Send a command to a tmux session",
                signature: "declare function send(params: { sessionId: string, command: string }): Promise<void>",
                async handler({ params, emit, signal }) {
                    // Send command to tmux
                    // Operation completes, output flows via stimuli
                }
            })
        }
    })

    // Optional: Define stimulus map for type-safe emit()
    type TmuxStimuli = {
        "tmux:output": { sessionId: string; data: string }
        "tmux:session:created": { id: string; name: string }
    }

    const capsuleDef = {
        name: "local-tmux",
        docs: "Local tmux capsule for terminal multiplexing",
        capabilities: [tmux] as const,

        senses: [
            {
                name: "tmux:output",
                docs: "Terminal output from tmux sessions",
                signature: "{ sessionId: string; data: string }"
            },
            {
                name: "tmux:session:created",
                docs: "Emitted when a new session is created",
                signature: "{ id: string; name: string }"
            }
        ],

        hooks: {
            async boot({ capsule }: LifecycleContext<TmuxStimuli>) {
                // Setup stream forwarding
                // mything.on("data", (data) => {
                //     capsule.emit({
                //         sense: "tmux:output",  // type-checked!
                //         data: { sessionId: "...", data }
                //     })
                // })
            },

            async shutdown({ capsule }: LifecycleContext<TmuxStimuli>) {
                // Cleanup stream forwarding
            }
        },

        middleware: [authMiddleware]
    } satisfies CapsuleDef<typeof tmux extends CapabilityDef<infer TOps> ? readonly [CapabilityDef<TOps>] : any, TmuxStimuli>

    const mycapsule = Capsule(capsuleDef)

    // Lifecycle: allow server to connect
    await mycapsule.boot()

    // Transport layer subscribes to stimuli
    const unsubscribe = mycapsule.onStimulus((stimulus) => {
        // Forward to transport
        // websocket.send(JSON.stringify(stimulus))
        console.log("Stimulus:", stimulus.sense, stimulus.data)
    })

    // Server invokes operation (runtime will enforce state = "booted")
    const result = await mycapsule.trigger(
        "tmux",
        "create",
        { sessionName: "my-session" }
    )

    console.log("Result:", result)

    // Lifecycle: disconnect
    await mycapsule.shutdown()

    // Cleanup subscription
    unsubscribe()
}

function _websocketExampleUsage() {
    // const websocket = createWebSocket()
    const capsule = Capsule({
        name: "my-capsule",
        capabilities: [],
        hooks: {}
    })

    // websocket.on("message", async (msg) => {
    //     if (msg.type === "capsule:boot") {
    //         await capsule.boot()
    //     }
    //
    //     if (msg.type === "capsule:trigger") {
    //         const result = await capsule.trigger(
    //             msg.capability,
    //             msg.operation,
    //             msg.params
    //         )
    //         websocket.send({ type: "capsule:result", result })
    //     }
    //
    //     if (msg.type === "capsule:shutdown") {
    //         await capsule.shutdown()
    //     }
    // })

    // capsule.onStimulus((stimulus) => {
    //     websocket.send({ type: "capsule:stimulus", stimulus })
    // })
}
