# Capabilities

## Why Capabilities Exist

Capabilities group related operations by domain. They prevent monolithic operation lists and provide namespace isolation. Each capability is self-contained and cannot invoke operations from other capabilities.

## Why Operations Are Namespaced

Namespacing prevents name collisions and clarifies intent. `tmux.create` is distinct from `filesystem.create`. The namespace is part of the invocation signature (`trigger("tmux", "create", params)`), making authority explicit.

## Why Operations Cannot Call Each Other

Operations are isolated function calls. They cannot invoke other operations, access middleware, or directly mutate capsule state. This prevents hidden call chains and makes invocations auditable. If operation A needs operation B, the mind must invoke both explicitly.

## Type-Safe Invocation via trigger()

The `trigger()` method is fully type-checked:

- Capability names are constrained to declared capabilities
- Operation names are constrained to operations within that capability
- Parameters are validated against the operation's expected type
- Return type is inferred from the operation definition

Invalid invocations are compile errors.

## Example

```typescript
import { defineCapability, defineOperation } from "@hexlabs/capsuleer"

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
        emit({
          sense: "tmux:session:created",
          data: { id: sessionId, name: params.sessionName }
        })
        return { id: sessionId }
      }
    })
  }
})
```
