# Capsule

## What a Capsule Represents

A capsule encapsulates **authority** and **sensory access** to a specific domain. It is the security boundary between intelligence and the world. The mind does not talk to the world directly—it talks to the capsule, and the capsule decides what is visible and invokable.

## Authority Encapsulation

Each capsule defines:

- **What operations are exposed**: via declared capabilities
- **What sensory input is available**: via stimulus streams
- **What middleware governs invocations**: via capsule-level and operation-level middleware
- **What lifecycle hooks manage resources**: via `boot()` and `shutdown()`

The mind cannot access anything outside the capsule's declared interface.

## Creating a Capsule

A capsule is created via `Capsule(def)`, which returns a `CapsuleInstance`. The definition specifies capabilities, middleware, lifecycle hooks, and optionally an SSH server configuration.

### Definition Structure

```typescript
{
  name: string                    // Capsule identifier
  docs?: string                   // Documentation
  capabilities: Capability[]      // Array of capabilities
  middleware?: Middleware[]       // Optional middleware (capsule-level)
  hooks?: {
    boot?: (ctx) => Promise<void>
    shutdown?: (ctx) => Promise<void>
  }
  senses?: Sense[]               // Optional stimulus definitions
  ssh?: SSHServerConfig          // Optional SSH server (starts during boot)
}
```

- **capabilities**: Array of defined capabilities (see `defineCapability()`)
- **middleware**: Applies to all operations in the capsule
- **hooks**: `boot()` runs after successful initialization, `shutdown()` runs during cleanup
- **senses**: Metadata about possible stimuli the capsule can emit
- **ssh**: Optional SSH server configuration. If provided, SSH server starts during `boot()`

### Creating an Instance

**Basic capsule** (no SSH server):

```typescript
const capsule = Capsule({
  name: 'my-capsule',
  capabilities: [capability1, capability2],
  senses: [...]
})

await capsule.boot()
```

**With SSH server:**

```typescript
const capsule = Capsule({
  name: 'my-capsule',
  capabilities: [capability1, capability2],
  ssh: {
    // SSH server configuration
    // See Transports doc for options
  }
})

await capsule.boot()  // SSH server starts automatically
```

See [Transports](./transports.md) for SSH server configuration details.

The returned `CapsuleInstance` has a unified interface. If SSH is configured, remote clients can connect and invoke operations over the network.

## CapsuleInstance Lifecycle

A `CapsuleInstance` manages three lifecycle phases:

1. **Initialization**: Ensures `capsule.boot()` has been called before servicing any invocations (idempotent, safe with multiple clients)
2. **Operation**: Clients subscribe to stimuli via `capsule.onStimulus(handler)` and invoke operations via `capsule.trigger(capability, operation, params)`
3. **Cleanup**: Calls `capsule.shutdown()` when the capsule is no longer needed (idempotent, aborts all in-flight operations)

`boot()` and `shutdown()` are instance-level lifecycle operations, not connection-level. In multi-client scenarios (e.g., SSH server with multiple connections), `boot()` is called once and `shutdown()` once—all clients share the same instance state.

The capsule itself knows nothing about which transport carries it—local and remote behavior is identical.

### Interface Overview

A `CapsuleInstance` exposes:

- `describe()` - Returns metadata about capabilities, operations, and senses
- `boot()` - Initializes the capsule (idempotent)
- `shutdown()` - Gracefully stops the capsule (idempotent)
- `trigger(capability, operation, params, signal?)` - Invokes an operation
- `emit(stimulus)` - Emits a stimulus event (callable from lifecycle hooks and operation handlers). **Non-blocking and best-effort**—emission does not affect operation execution and does not fail. If called outside the booted state, silently returns.
- `onStimulus(handler)` - Subscribes to stimulus events (returns unsubscribe function)

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│  Mind (Cognos, LLM, reasoning system)       │
└───────────────────┬─────────────────────────┘
                    │ (transport layer: WebSocket, IPC, etc.)
                    │
┌───────────────────▼─────────────────────────┐
│  Capsule Instance                           │
│  ┌─────────────────────────────────────┐    │
│  │ Middleware (policy enforcement)     │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ Capabilities (namespaced ops)       │    │
│  │   - Operation handlers              │    │
│  │   - emit() for stimuli              │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ Stimulus streams (ambient sensory)  │    │
│  └─────────────────────────────────────┘    │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
              Real world
        (files, processes, devices)
```
