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

A capsule is created via `Capsule(config)`, which returns a `CapsuleInstance`. The config specifies the capsule definition and transport (local or SSH).

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
}
```

- **capabilities**: Array of defined capabilities (see `defineCapability()`)
- **middleware**: Applies to all operations in the capsule
- **hooks**: `boot()` runs after successful initialization, `shutdown()` runs during cleanup
- **senses**: Metadata about possible stimuli the capsule can emit

### Creating an Instance

**Local execution** (in-process):

```typescript
const capsule = Capsule({
  def: capsuleDef,
  transport: 'local'
})
```

**Remote execution** (over SSH):

```typescript
const capsule = Capsule({
  def: capsuleDef,
  transport: 'ssh',
  ssh: {
    host: 'example.com',
    username: 'user',
    auth: { type: 'key', path: '~/.ssh/id_rsa' },
    capsulePath: '/usr/local/bin/capsule'
  },
  remoteName: 'my-capsule'
})
```

See [Transports](./transports.md) for detailed SSH configuration options.

The returned `CapsuleInstance` has an **identical interface** regardless of transport. All operations and stimulus subscriptions work the same way.

## CapsuleInstance Lifecycle

A `CapsuleInstance` is controlled by a transport layer that:

1. Calls `capsule.boot()` when a connection is established
2. Subscribes to stimuli via `capsule.onStimulus(handler)`
3. Invokes operations via `capsule.trigger(capability, operation, params)`
4. Calls `capsule.shutdown()` when the connection closes

The capsule itself knows nothing about which transport carries it—local or remote behavior is identical.

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
