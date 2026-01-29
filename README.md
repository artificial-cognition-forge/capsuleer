# Capsuleer

A runtime boundary system for exposing controlled capabilities and sensory streams to external cognitive systems, with **SSH as a first-class transport**.

**Built for distributed agents, not monoliths.** A capsule is a secure environment that agents remotely inhabit. Instead of streaming commands back and forth, agents invoke discrete operations while continuous sensory stimuli stream unidirectionally to the agent. This architecture enables agents to selectively attend to ambient input and react to environmental changes without polling.

## What It Solves

Capsuleer provides a type-safe, auditable interface between intelligence (LLMs, agents, reasoning systems) and the real world. It solves:

- **Authority control**: Define exactly what operations are available to external systems
- **Policy enforcement**: Intercept and validate all invocations through middleware
- **Graded embodiment**: Control sensory richness and capability levels
- **Safe execution**: Built-in cancellation, lifecycle management, and one-way stimulus flow
- **Network transparency**: Seamless SSH support—write once, run locally or expose over SSH

Think of a capsule as a device driver or syscall surface for AI systems—a stable, minimal interface to authority that cannot be bypassed.

## The SSH Feature

SSH is deeply integrated into Capsuleer. When you define a capsule with SSH configuration, the runtime:

1. **Starts an SSH server** during `capsule.boot()`
2. **Authenticates clients** via public key (optionally via custom auth handlers)
3. **Routes operations** from remote clients directly to operation handlers
4. **Streams stimuli** back to all connected clients in real-time
5. **Manages lifecycle** per-capsule (not per-connection)

The API is identical whether running locally or accessed over SSH. Remote clients get complete metadata via `capsule.describe()`, including SSH connection details (`host`, `port`, `username`, public key, and fingerprint).

```typescript
// Get SSH connection details after boot
const sshDetails = capsule.ssh()
// Returns: { host, port, username, publicKey, publicKeyFingerprint }
```

This means you can program against the capsule locally during development, then expose it to remote agents without changing a single line of code.

## Documentation

For full documentation, examples, and API reference, visit the docs:

**[Read the Documentation →](./docs/)**

## Quick Example

### Local Capsule

```typescript
import { Capsule, defineCapability, defineOperation } from 'capsuleer'

const fileOps = defineCapability({
  name: 'files',
  docs: 'File operations',
  operations: {
    read: defineOperation({
      name: 'read',
      docs: 'Read a file',
      signature: '(path: string) => string',
      handler: async ({ params }) => readFileSync(params.path, 'utf-8')
    })
  }
})

const capsule = Capsule({
  name: 'filesystem',
  capabilities: [fileOps]
})

await capsule.boot()
const content = await capsule.trigger('files', 'read', { path: './data.txt' })
```

### With SSH Server

```typescript
const capsule = Capsule({
  name: 'filesystem',
  capabilities: [fileOps],
  ssh: {
    hostKeyPath: '/path/to/ssh/key',
    port: 2222,
    username: 'capsule'  // optional, defaults to 'capsule'
  }
})

await capsule.boot()

// Get SSH connection details for remote clients
const sshDetails = capsule.ssh()
console.log(`Connect via: ssh -i <key> ${sshDetails.username}@${sshDetails.host}:${sshDetails.port}`)

// Remote clients can now invoke operations over SSH
// The API on the server side is identical to the local example above
```

## Key Topics

**Core Concepts**
- [Capsule](./docs/capsule.md) - Runtime container, lifecycle, and SSH integration
- [Capabilities](./docs/capabilities.md) - Type-safe operation definitions
- [Middleware](./docs/middleware.md) - Policy enforcement and interception
- [Stimuli](./docs/stimuli.md) - One-way sensory event streams
- [Lifecycle](./docs/lifecycle.md) - Boot/shutdown hooks and state transitions
- [Transports](./docs/transports.md) - SSH server configuration and remote access

**Reference**
- [Invariants](./docs/invariants.md) - Runtime guarantees and constraints
- [Minimal Example](./docs/examples/minimal.md) - Complete working example with SSH

## License

MIT
