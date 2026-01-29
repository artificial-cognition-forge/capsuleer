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

## With SSH Server

To expose the capsule over SSH, add the `ssh` field to the definition:

```typescript
import { Capsule } from "@hexlabs/capsuleer"

const capsule = Capsule({
  name: "tmux",
  docs: "Terminal multiplexer with SSH",
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
      // Setup here
    },
    async shutdown({ capsule }) {
      // Cleanup here
    }
  },
  // SSH server configuration
  ssh: {
    // Configuration for SSH server that clients connect to
    // See Transports doc for available options
  }
})

// Boot starts the SSH server
await capsule.boot()

// Remote clients can now connect via SSH and invoke operations
capsule.onStimulus((stimulus) => {
  console.log("Stimulus from operation:", stimulus.sense, stimulus.data)
})

await capsule.shutdown()
```

The `ssh` field makes this capsule available to remote clients over SSH. The API remains the same—you still use `trigger()` and `onStimulus()` locally.

See [Transports](../transports.md) for SSH server configuration options and how remote clients connect.
