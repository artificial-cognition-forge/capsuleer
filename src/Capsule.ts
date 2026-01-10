import type {
    CapsuleDef,
    CapsuleInstance,
    CapsuleMetadata,
    StimulusHandler,
    Stimulus,
    ExtractCapabilityNames,
    ExtractOperationNames,
    ExtractOperationParams,
    ExtractOperationReturn,
    OperationMiddleware,
    MiddlewareResult
} from "../types/mod.js"

type CapsuleState = "created" | "booted" | "shutdown"

export function Capsule<
    TCapabilities extends readonly any[] = readonly any[],
    TStimulusMap extends Record<string, any> = Record<string, any>
>(
    def: CapsuleDef<TCapabilities, TStimulusMap>
): CapsuleInstance<CapsuleDef<TCapabilities, TStimulusMap>> {
    let state: CapsuleState = "created"
    const stimulusListeners = new Set<StimulusHandler>()
    let inLifecycleHook = false // Track if we're currently in a lifecycle hook

    // Track in-flight operations for abort-on-shutdown
    const inFlightOperations = new Set<AbortController>()

    // Generate unique capsule instance ID
    const capsuleId = `${def.name}-${Math.random().toString(36).slice(2, 11)}`

    return {
        describe(): CapsuleMetadata {
            return {
                id: capsuleId,
                name: def.name,
                docs: def.docs,
                capabilities: def.capabilities.map((cap: any) => ({
                    name: cap.name,
                    docs: cap.docs,
                    operations: Object.values(cap.operations).map((op: any) => ({
                        name: op.name,
                        docs: op.docs,
                        signature: op.signature,
                        kind: op.kind ?? "call"
                    }))
                })),
                senses: def.senses
            }
        },

        async boot(): Promise<void> {
            if (state === "booted") return
            if (state === "shutdown") {
                throw new Error("Cannot boot a shutdown capsule")
            }

            // Only transition state AFTER successful boot hook execution
            if (def.hooks?.boot) {
                inLifecycleHook = true
                try {
                    await def.hooks.boot({
                        capsule: { emit: this.emit.bind(this) }
                    })
                } finally {
                    inLifecycleHook = false
                }
            }

            state = "booted"
        },

        async shutdown(): Promise<void> {
            if (state === "shutdown") return
            if (state === "created") {
                throw new Error("Cannot shutdown a capsule that was never booted")
            }

            // Abort all in-flight operations before running shutdown hook
            for (const controller of inFlightOperations) {
                controller.abort("system")
            }
            inFlightOperations.clear()

            // Run shutdown hook but always transition state afterward
            try {
                if (def.hooks?.shutdown) {
                    inLifecycleHook = true
                    try {
                        await def.hooks.shutdown({
                            capsule: { emit: this.emit.bind(this) }
                        })
                    } finally {
                        inLifecycleHook = false
                    }
                }
            } finally {
                state = "shutdown"
                stimulusListeners.clear()
            }
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
            if (state !== "booted") {
                throw new Error(`Cannot trigger operations: capsule is ${state}`)
            }

            // Create an AbortController to track this operation
            // If caller provided a signal, we need to link them
            const operationController = new AbortController()
            let effectiveSignal = operationController.signal

            // If caller provided a signal, forward its abort to our controller
            if (signal) {
                if (signal.aborted) {
                    throw new Error(`Operation aborted: ${capability}.${operation}`)
                }
                signal.addEventListener("abort", () => {
                    operationController.abort(signal.reason)
                }, { once: true })
            }

            // Track this operation
            inFlightOperations.add(operationController)

            // Locate capability
            const cap = def.capabilities.find((c: any) => c.name === capability)
            if (!cap) {
                throw new Error(`Capability not found: ${capability}`)
            }

            // Locate operation
            const op = cap.operations[operation as string]
            if (!op) {
                throw new Error(`Operation not found: ${capability}.${operation}`)
            }

            // Build middleware chain: capsule-level first, then operation-level
            const middlewareChain: OperationMiddleware<any>[] = [
                ...(def.middleware || []),
                ...(op.middleware || [])
            ]

            // Run middleware chain
            let effectiveParams = params
            for (const middleware of middlewareChain) {
                // Create invocation context (middleware MUST NOT access execution affordances)
                const invocationCtx = {
                    capability,
                    operation,
                    params: effectiveParams,
                    signal: effectiveSignal
                }

                const result: MiddlewareResult<any> = await middleware(invocationCtx)

                if (result.type === "reject") {
                    throw new Error(`Operation rejected by middleware: ${result.reason}`)
                }

                if (result.type === "transform") {
                    effectiveParams = result.params
                }

                // type === "accept" continues without changes
            }

            // Create a provenance-aware emit function for this specific operation
            const operationProvenance = { capability, operation }
            const emitWithProvenance = (stimulus: Omit<Stimulus, "timestamp">) => {
                // Operations should only run when booted, so this is already guaranteed
                // But check anyway for safety
                if (state !== "booted") {
                    return
                }

                const fullStimulus: Stimulus = {
                    ...stimulus,
                    timestamp: Date.now(),
                    source: {
                        capability: operationProvenance.capability,
                        operation: operationProvenance.operation
                    }
                }

                for (const listener of stimulusListeners) {
                    listener(fullStimulus)
                }
            }

            // Create execution context
            const ctx = {
                params: effectiveParams,
                signal: effectiveSignal,
                emit: emitWithProvenance
            }

            try {
                // Call handler (any emit() calls will include provenance)
                return await op.handler(ctx)
            } finally {
                // Remove from in-flight tracking
                inFlightOperations.delete(operationController)
            }
        },

        emit(stimulus: Omit<Stimulus, "timestamp">): void {
            // Only allow emit when booted, or during lifecycle hooks
            if (state !== "booted" && !inLifecycleHook) {
                return
            }

            // This emit is used by lifecycle hooks, which don't have provenance
            const fullStimulus: Stimulus = {
                ...stimulus,
                timestamp: Date.now()
                // No source provenance for lifecycle hook emissions
            }

            for (const listener of stimulusListeners) {
                listener(fullStimulus)
            }
        },

        onStimulus(handler: StimulusHandler): () => void {
            stimulusListeners.add(handler)
            return () => {
                stimulusListeners.delete(handler)
            }
        }
    }
}