# Minimal Example

```typescript
import { Capsule, defineCapability, defineOperation } from "@hexlabs/capsuleer"

// Define a capability with one operation
const tmux = defineCapability({
  name: "tmux",
  docs: "Terminal multiplexer operations",
  operations: {
    create: defineOperation<
      { sessionName: string },
      { id: string }
    >({
      name: "create",
      docs: "Create a new tmux session",
      signature: "declare function create(options: { sessionName: string }): Promise<{ id: string }>",
      async handler({ params, emit, signal }) {
        const sessionId = "session-123"

        // Emit a stimulus event
        emit({
          sense: "tmux:session:created",
          data: { id: sessionId, name: params.sessionName }
        })

        return { id: sessionId }
      }
    })
  }
})

// Create a local capsule
const capsule = Capsule({
  def: {
    name: "local-tmux",
    docs: "Local tmux capsule for terminal multiplexing",
    capabilities: [tmux] as const,

    senses: [
      {
        name: "tmux:session:created",
        docs: "Emitted when a new session is created",
        signature: "{ id: string; name: string }"
      }
    ],

    hooks: {
      async boot({ capsule }) {
        // Setup external streams here
      },
      async shutdown({ capsule }) {
        // Cleanup here
      }
    }
  },
  transport: 'local'
})

// Boot the capsule
await capsule.boot()

// Subscribe to stimulus events
const unsubscribe = capsule.onStimulus((stimulus) => {
  console.log("Stimulus:", stimulus.sense, stimulus.data)
  // Output: Stimulus: tmux:session:created { id: 'session-123', name: 'my-session' }
})

// Invoke an operation
const result = await capsule.trigger(
  "tmux",
  "create",
  { sessionName: "my-session" }
)
console.log("Result:", result)
// Output: Result: { id: 'session-123' }

// Shutdown the capsule
await capsule.shutdown()

// Cleanup subscription
unsubscribe()
```

## Remote SSH Example

The same definition works over SSH with a different transport config:

```typescript
import { Capsule } from "@hexlabs/capsuleer"

// Same definition as above
const capsule = Capsule({
  def: {
    name: "remote-tmux",
    capabilities: [tmux] as const,
    senses: [
      {
        name: "tmux:session:created",
        docs: "Emitted when a new session is created",
        signature: "{ id: string; name: string }"
      }
    ],
    hooks: {
      async boot({ capsule }) {},
      async shutdown({ capsule }) {}
    }
  },
  // Only the transport config differs
  transport: 'ssh',
  ssh: {
    host: 'devbox.example.com',
    username: 'tmux-user',
    auth: { type: 'key', path: '~/.ssh/id_rsa' },
    capsulePath: '/usr/local/bin/capsule'
  },
  remoteName: 'remote-tmux'
})

// Same API: boot, trigger, listen, shutdown
await capsule.boot()

capsule.onStimulus((stimulus) => {
  console.log("Stimulus:", stimulus.sense, stimulus.data)
})

const result = await capsule.trigger(
  "tmux",
  "create",
  { sessionName: "my-session" }
)
console.log("Result:", result)

await capsule.shutdown()
```

The difference from the local example:
- Capsule runs on a remote machine via SSH
- Parameters and results are JSON-serialized
- Stimuli stream back asynchronously
- Type safety is preserved at compile time
- No ability to emit stimuli locally (one-way flow)

See [Transports](../transports.md) for detailed configuration options and trade-offs.
