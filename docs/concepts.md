# Concepts

## Capsule

A **Capsule** is a long-lived, connectable runtime with metadata, lifecycle hooks, middleware, capabilities, and sensory output (stimuli). Capsules are standalone and decoupled from any cognitive system. They define what authority is available and what sensory input is visible.

## Capability

A **Capability** is a namespace of related operations. Each capability groups operations by domain (e.g., `tmux`, `filesystem`). Capabilities are explicitly declared and cannot invoke each other. They define the boundaries of what the mind can request.

## Operation

An **Operation** is a single function call with typed parameters and return value. Operations are invoked deliberately via `trigger()`. They may fail, be rejected by middleware, or be interrupted. Operations must be deterministic given their inputs and cannot call other operations.

## Stimulus

A **Stimulus** is an ambient sensory event emitted by the capsule. Stimuli are one-directional (capsule → server) and represent background signals like terminal output, file system events, or logs. They are **not** responses to operations—use return values for that. Stimuli carry provenance metadata (which operation emitted them, if any).

## Middleware

**Middleware** is a policy membrane that intercepts operation invocations before execution. Middleware can accept, reject, or transform invocations. It sees only invocation metadata (capability, operation, params, signal)—never execution affordances like `emit()`. Middleware is authoritative and cannot be bypassed by handlers.
