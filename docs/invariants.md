# Invariants

## Type-Level Invariants (Enforced by TypeScript)

- **Middleware cannot access execution context**: `OperationInvocationContext` vs `OperationExecutionContext` are separate types. Middleware has no `emit()` affordance.
- **Middleware transformations must preserve param types**: `MiddlewareResult<TParams>` is generic. Transform must return `{ params: TParams }`.
- **Handlers cannot access middleware**: Handler signature receives only `OperationExecutionContext`.
- **Lifecycle hooks have limited capsule access**: `LifecycleContext` provides only `Pick<CapsuleInstance, "emit">`.
- **trigger() only accepts valid capability/operation pairs**: Type extraction helpers (`ExtractCapabilityNames`, `ExtractOperationNames`, etc.) constrain invocations at compile time.
- **trigger() params/returns are type-checked**: `ExtractOperationParams` and `ExtractOperationReturn` enforce type agreement.
- **emit() can be constrained to declared stimuli**: When `StimulusMap` is provided, only valid `sense` identifiers are allowed.

## Runtime Invariants (Enforced by Implementation)

- **State transitions are one-way**: `created → booted → shutdown`. No backtracking.
- **boot() transitions created → booted**: Must be idempotent.
- **shutdown() transitions booted → shutdown**: Must be idempotent. Must abort in-flight operations.
- **trigger() is illegal unless state is "booted"**: Must throw if called in `"created"` or `"shutdown"` state.
- **emit() must no-op or throw unless state is "booted"**: Prevents stimuli leaking during wrong lifecycle phase.
- **Middleware rejection stops operation execution**: If middleware returns `{ type: "reject" }`, handler must not run.
- **Stimuli must have timestamp added by runtime**: `emit()` receives `Omit<Stimulus, "timestamp">`. Runtime adds timestamp before forwarding to subscribers.
- **Source provenance is added automatically**: When operations emit, runtime injects `{ source: { capability, operation } }`.
- **AbortSignal propagates to middleware and handlers**: Runtime must pass `signal` to all layers and abort in-flight work on shutdown.

## Social Contracts (Documented but Not Enforced)

- **Operations must not invoke other operations**: No type-level or runtime check (would require complex tracking). Documented in NON-GOALS comments.
- **Middleware must not emit stimuli**: Type-level enforcement via no `emit()` in `OperationInvocationContext`.
- **Lifecycle hooks must not invoke operations**: Partially enforced (hooks don't receive `trigger()`). Could be bypassed with external reference (considered misuse).

## Security Checklist

Could an adversarial system trying to escape the sandbox:

- **Invoke operations it shouldn't?** NO—middleware can reject.
- **Call operations outside the capsule?** NO—no reference to external operations.
- **Bypass policy checks?** NO—middleware runs before handlers.
- **Emit stimuli without provenance?** NO—runtime adds source metadata.
- **Access execution context from middleware?** NO—separate types prevent it.
- **Continue after cancellation?** NO—signal propagates, runtime aborts.
- **Invoke with wrong types?** NO—TypeScript prevents it.

If any answer is "yes", the type system or runtime needs tightening.
