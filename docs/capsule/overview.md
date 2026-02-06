# Capsule Overview

A **Capsule** is a bounded execution environment with defined capabilities, mediation policies, and lifecycle hooks. Capsules are standalone, decoupled from the cognitive system. They define what authority is available and what sensory output is visible.

## What a Capsule Is

A capsule describes:

- **Available runtimes** — What executors are available (shell, typescript, custom)
- **Capability APIs** — Operations clients can invoke
- **Mediation policies** — Rules enforcing what is allowed
- **Lifecycle hooks** — Setup/teardown on boot/shutdown
- **Environment configuration** — Environment variables, runtime settings

## What a Capsule Is NOT

- **Not a container** — Capsules don't isolate resources or filesystems
- **Not a process manager** — Daemon manages processes; capsule describes rules
- **Not a cognitive agent** — Capsules don't make decisions; they define boundaries
- **Not persistent** — Capsules don't store state across daemon restarts
- **Not serverless** — Capsules are long-lived, not function-scoped

## Capsule Blueprint

A capsule is defined by a **blueprint** — a TypeScript object describing its properties:

```typescript
const blueprint = {
  name: 'default',
  description: 'Default execution environment',

  // Environment variables available to processes
  env: {
    PATH: '/usr/bin:/bin',
    HOME: '/tmp/capsule'
  },

  // Boot hook (setup)
  boot: async () => {
    // Called once when daemon starts
    // Set up external streams, initialize resources
  },

  // Shutdown hook (cleanup)
  shutdown: async () => {
    // Called once when daemon shuts down
    // Clean up streams, release resources
  },

  // Capability surface (empty for now)
  scope: {}
}
```

**Lifecycle Invariants:**

- `boot()` must be idempotent (calling twice is safe)
- `shutdown()` must be idempotent
- Both may abort in-flight operations on signal

## Sessions and Processes

When a client connects to a capsule:

```
Client → attach-capsule(capsuleId) → Session (RPC-level)
                                        ↓
                            Capsule Session (internal)
                                        ↓
                        Process ownership boundary
                                        ↓
                         Process 1 (shell, running)
                         Process 2 (shell, running)
                         Process 3 (typescript, exited)
```

**Session invariants:**

- Each client/capsule pair has one implicit session
- Session owns all spawned processes
- Session isolation prevents cross-session interference
- Killing session kills all owned processes

## Runtimes

Capsules expose runtimes that clients can spawn:

### shell

POSIX shell (bash, sh).

```typescript
const proc = await session.spawn('shell')
await proc.stdin('echo "Hello"\n')
for await (const chunk of proc.stdout) { /* ... */ }
```

**Behavior:**
- Reads commands from stdin
- Executes via `eval` (not a subshell per command)
- Outputs to stdout/stderr
- No interactive terminal (pipes only)

### typescript

Node.js REPL for TypeScript/JavaScript.

```typescript
const proc = await session.spawn('typescript')
await proc.stdin('const x = 1 + 1; x\n')
for await (const chunk of proc.stdout) { /* ... */ }
```

**Behavior:**
- Evaluates TypeScript expressions
- Each statement on new line
- Output to stdout (undefined results print as empty)
- Async/await supported

### Custom Runtimes

Capsules can define additional runtimes via blueprint. Daemon invokes them as executables.

## Capability APIs

Capsules can expose capability APIs that clients invoke via `trigger()` RPC calls.

**Not yet implemented** — Currently the SDK only supports `spawn()` and stream operations. Capability APIs are future work.

Example (conceptual):

```typescript
// In blueprint
scope: {
  filesystem: {
    read: async (path) => { /* ... */ },
    write: async (path, data) => { /* ... */ },
  }
}

// Client-side (future)
const data = await session.trigger('filesystem:read', { path: '/tmp/file' })
```

## Mediation Policies

Capsules can define policies that intercept and approve/reject operations.

**Not yet implemented** — Currently all operations are allowed. Production use would add mediation at capsule level.

Example (conceptual):

```typescript
// In blueprint
mediation: {
  on_spawn: (runtime) => {
    if (runtime === 'shell') return { allow: true }
    if (runtime === 'typescript') return { allow: false, reason: 'Not permitted' }
  }
}
```

## Creating a Capsule

To create a capsule:

1. Define blueprint (TypeScript object with lifecycle hooks)
2. Register with daemon (add to capsule registry)
3. Restart daemon
4. Clients can connect via `client.connect(capsuleId)`

**Minimal capsule:**

```typescript
const blueprint = {
  name: 'my-capsule',
  description: 'My execution environment',
  env: {},
  boot: async () => {},
  shutdown: async () => {},
  scope: {}
}

// Register (TODO: currently hardcoded; will be disk-based)
```

## Process Ownership

All processes belong to their session:

```
Session
  ├── Process 1
  ├── Process 2
  └── Process 3

// Kill session
await session.kill()
// All processes terminated (SIGKILL)
```

Killing a session is **immediate and irreversible**. All owned processes are force-terminated.

## Error Conditions

### Runtime Not Found

```typescript
const proc = await session.spawn('python')  // Throws
// Error: INVALID_RUNTIME: 'python' not supported
```

### Session Inactive

```typescript
const session = await client.connect('default')
await client.disconnect()
const proc = await session.spawn('shell')  // Throws
// Error: SESSION_INACTIVE: Session not active
```

### Capsule Boot Fails

If capsule.boot() throws during daemon startup, daemon exits with error. Check logs via `capsuleer tail`.

## Best Practices

**For Capsule Authors:**

1. **Keep boot/shutdown lightweight** — They block daemon startup/shutdown
2. **Make both idempotent** — Assume they may be called multiple times
3. **Handle signals in long-running setup** — Respect AbortSignal for graceful shutdown
4. **Don't spawn processes in boot/shutdown** — Only setup resources
5. **Use env for configuration** — Don't hardcode paths or settings

**For Clients:**

1. **Always call stdinEnd()** after sending input
2. **Always detach or kill processes** before disconnecting
3. **Always call client.disconnect()** for cleanup
4. **Never assume capsule resources** — Check capabilities first
5. **Handle timeouts** — RPC calls have 30-second timeout

## Next Steps

- **[Blueprint Anatomy](/capsule/blueprint-anatomy)** — Detailed blueprint specification
- **[Creating Capsules](/capsule/creating-capsules)** — Step-by-step guide
- **[Capability APIs](/capsule/capability-apis)** — Defining operations (future)
- **[Mediation Policies](/capsule/mediation-policies)** — Defining rules (future)
