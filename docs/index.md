# Capsuleer

**Capsuleer** is a runtime boundary system for exposing controlled capabilities and sensory streams to external cognitive systems. A capsule is a minimal, auditable membrane between intelligence and the real world.

Capsules are not agents. They do not reason, plan, or decide goals. They are isolated runtimes that expose explicit operations and ambient sensory input to an external mind (e.g., Cognos, an LLM-based system, or any reasoning process). Think of a capsule as a device driver or syscall surface—a stable interface to authority.

## What Problems Does This Solve?

- **Authority control**: Intelligence should not have direct access to the world. Capsules define what is visible and invokable.
- **Graded embodiment**: Different capsules expose different levels of sensory richness and capability.
- **Policy enforcement**: Middleware intercepts invocations before execution, enabling redaction, rate-limiting, and approval flows.
- **Transport independence**: Capsules are agnostic to WebSockets, HTTP, or IPC. Authority is encoded in capabilities, not transport.
- **Interruptibility**: All operations support cancellation via `AbortSignal`. No runaway execution.

## Core Guarantees

- **Type-safe invocation**: Invalid capability/operation pairs are compile errors.
- **One-way stimulus flow**: Sensory events flow capsule → server only. The mind cannot push data into the capsule.
- **Middleware is authoritative**: Operations cannot bypass policy checks. Middleware runs before handlers.
- **Lifecycle enforcement**: Operations are illegal before `boot()` and after `shutdown()`.
- **Separation of concerns**: Middleware cannot emit stimuli. Handlers cannot invoke other operations.

## Non-Goals

This package does **not**:

- Contain cognition, planning, or reasoning logic
- Embed agent behavior or autonomous action
- Infer intent or "help" by guessing what the mind wants
- Manage transport, networking, or authentication
- Provide a platform or framework—it is a library
