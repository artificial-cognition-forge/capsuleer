# Middleware

## Middleware as Policy Membrane

Middleware intercepts operation invocations **before** handlers execute. It enforces policy (authorization, rate-limiting, redaction) without touching handler logic. Middleware is authoritative—handlers cannot bypass it.

## Invocation Context vs Execution Context

- **Invocation context**: What middleware sees. Includes `capability`, `operation`, `params`, `signal`. Does **not** include `emit()` or capsule references.
- **Execution context**: What handlers see. Includes `params`, `signal`, `emit()`. Handlers have execution affordances that middleware must not access.

This separation prevents middleware from emitting stimuli or accessing the capsule directly.

## Accept / Reject / Transform Semantics

Middleware returns one of three results:

- `{ type: "accept" }`: Allow the invocation to proceed unchanged
- `{ type: "reject", reason: string }`: Stop execution, handler does not run
- `{ type: "transform", params: TParams }`: Modify parameters before passing to handler (must preserve type)

## Why Middleware Cannot Emit Stimuli

Middleware sees only invocation metadata. It has no `emit()` affordance. This prevents middleware from generating sensory events (which are execution-time outputs) and keeps policy enforcement separate from execution.

## Example

```typescript
import { defineMiddleware } from "@hexlabs/capsuleer"

const authMiddleware = defineMiddleware({
  name: "auth",
  docs: "Validates authentication tokens",
  async handler({ params, capability, operation, signal }) {
    const hasPermission = true // auth check
    if (!hasPermission) {
      return { type: "reject", reason: "Unauthorized" }
    }
    return { type: "accept" }
  }
})

// Attach to capsule
const capsuleDef = {
  name: "my-capsule",
  capabilities: [tmux],
  middleware: [authMiddleware]
}
```
