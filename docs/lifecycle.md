# Lifecycle

## Capsule States

A capsule transitions through three states:

- `created`: Capsule instantiated but not connected
- `booted`: Capsule connected and operational
- `shutdown`: Capsule disconnected and cleaned up

Transitions are one-way: `created → booted → shutdown`.

## What boot/shutdown Are For

### boot()

Called once when the capsule is connected. Used to:

- Set up external streams (e.g., terminal output forwarding)
- Attach listeners to external systems
- Initialize resources

The boot hook receives a limited capsule interface (`emit()` only).

### shutdown()

Called once when the capsule is disconnected. Used to:

- Clean up streams and listeners
- Release resources
- Stop background work
- Abort in-flight operations

Both `boot()` and `shutdown()` must be idempotent (calling twice is safe).

## Why Lifecycle Hooks Cannot Invoke Operations

Lifecycle hooks receive `LifecycleContext`, which provides only `capsule.emit()`. They cannot call `trigger()`. This prevents circular dependencies and keeps lifecycle management separate from operation invocation.

## Interruptibility and Abort Behavior

All operations accept an `AbortSignal`. When a capsule is shut down:

- All in-flight operations are aborted
- Handlers should check `signal.aborted` for long-running work
- The runtime propagates abort to middleware and handlers

Abort reasons:

- `"user"`: Explicit cancellation by the caller
- `"system"`: Capsule shutdown
- `"timeout"`: Operation-specific timeout (if implemented by transport)

## Runtime Enforcement

The implementation must enforce:

- `trigger()` throws if state is not `"booted"`
- `emit()` throws or no-ops if state is not `"booted"`
- `boot()` transitions `created → booted`
- `shutdown()` transitions `booted → shutdown`
- Both are idempotent
