# Capsuleer

A runtime boundary system for exposing controlled capabilities and sensory streams to external cognitive systems.

## What It Solves

Capsuleer provides a type-safe, auditable interface between intelligence (LLMs, agents, reasoning systems) and the real world. It solves:

- **Authority control**: Define exactly what operations are available to external systems
- **Policy enforcement**: Intercept and validate all invocations through middleware
- **Graded embodiment**: Control sensory richness and capability levels
- **Safe execution**: Built-in cancellation, lifecycle management, and one-way stimulus flow

Think of a capsule as a device driver or syscall surface for AI systems—a stable, minimal interface to authority that cannot be bypassed.

## Documentation

For full documentation, examples, and API reference, visit the docs:

**[Read the Documentation →](./docs/)**

## Quick Example

```typescript
import { Capsule, defineCapability, defineOperation } from 'capsuleer'

const fileOps = defineCapability({
  name: 'files',
  operations: {
    read: defineOperation({
      name: 'read',
      signature: '(path: string) => string',
      handler: async ({ params }) => readFileSync(params.path, 'utf-8')
    })
  }
})

const capsule = Capsule({
  name: 'filesystem',
  capabilities: [fileOps],
  senses: []
})

await capsule.boot()
const content = await capsule.invoke('files', 'read', { path: './data.txt' })
```

## License

MIT
