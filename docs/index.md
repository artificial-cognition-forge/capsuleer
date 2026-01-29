# Capsuleer

**Capsuleer** is a runtime boundary system for exposing controlled capabilities and sensory streams to external cognitive systems. A capsule is a minimal, auditable membrane between intelligence and the real world.

Capsules are not agents. They do not reason, plan, or decide goals. They are isolated runtimes that expose explicit operations and ambient sensory input to an external mind (e.g., Cognos, an LLM-based system, or any reasoning process). Think of a capsule as a device driver or syscall surface—a stable interface to authority.

## What Problems Does This Solve?

- **Authority control**: Intelligence should not have direct access to the world. Capsules define what is visible and invokable.
- **Graded embodiment**: Different capsules expose different levels of sensory richness and capability.
- **Policy enforcement**: Middleware intercepts invocations before execution, enabling redaction, rate-limiting, and approval flows.
- **Transport flexibility**: Capsules support both local (in-process) and remote (SSH) execution with identical APIs. Authority is encoded in capabilities, not transport.
- **Interruptibility**: All operations support cancellation via `AbortSignal`. No runaway execution.

## Core Guarantees

- **Type-safe invocation**: Invalid capability/operation pairs are compile errors.
- **One-way stimulus flow**: Sensory events flow capsule → server only. The mind cannot push data into the capsule.
- **Middleware is authoritative**: Operations cannot bypass policy checks. Middleware runs before handlers.
- **Lifecycle enforcement**: Operations are illegal before `boot()` and after `shutdown()`.
- **Separation of concerns**: Middleware cannot emit stimuli. Handlers cannot invoke other operations.

## SSH Remote Access

Capsules can expose an SSH server to allow remote clients (other systems, cognitive agents, services) to invoke operations over the network. This is the centerpiece of distributed authority boundaries.

**Enable with a single config:**

```typescript
const capsule = Capsule({
  name: 'my-capsule',
  capabilities: [...],
  ssh: {
    host: '0.0.0.0',
    port: 2222,
    auth: { type: 'key', path: '/etc/capsule/key' }
  }
})

await capsule.boot()  // SSH server starts automatically
```

**All guarantees apply across the network:**
- Remote clients get full type safety (capability/operation pairs are compile-checked locally)
- Middleware runs before handlers, even for remote invocations
- Stimulus events stream back to remote clients in real-time
- Cancellation via `AbortSignal` propagates over SSH
- One-way stimulus flow: remote clients cannot push data into the capsule

**Common use cases:**
- **Privilege separation**: Run capsule as a restricted user while clients run with different permissions
- **Network isolation**: Capsule on isolated network, clients connect over encrypted SSH tunnel
- **Multi-machine deployments**: Expose capsule on one machine, invoke from another with zero logic changes
- **Distributed cognitive systems**: Expose specialized capsules as services to other LLM-based systems

The SSH server is optional—capsules work fine without it. But when enabled, it transforms a single-process boundary into a distributed authority boundary.

See [Transports](./transports.md) for SSH configuration details and examples.

## Non-Goals

This package does **not**:

- Contain cognition, planning, or reasoning logic
- Embed agent behavior or autonomous action
- Infer intent or "help" by guessing what the mind wants
- Manage transport, networking, or authentication
- Provide a platform or framework—it is a library

## Documentation Guide

**Start here:**
- **[Minimal Example](./examples/minimal.md)** - Complete working example

**Core concepts:**
- **[Capsule](./capsule.md)** - Authority boundaries and the unified API
- **[Middleware](./middleware.md)** - Policy enforcement before operation execution
- **[Transports](./transports.md)** - Local vs SSH remote execution
