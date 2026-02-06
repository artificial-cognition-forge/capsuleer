# SDK Overview

The Capsuleer SDK is a **multiplexed RPC client** for spawning and managing processes on remote capsules over SSH.

## What the SDK Does

The SDK provides a programmatic interface to the Capsuleer daemon:

```
CapsuleerClient → connect(capsuleId) → Session → spawn(runtime) → Process
                                                 ↓
                                    streams: stdout, stderr, events
```

**Core responsibility**: Transform authenticated client intent into process I/O streams.

## What the SDK Is NOT

- **Not an SSH wrapper** — Uses SSH as transport, not exposed directly
- **Not a shell executor** — Capsules define what runtimes are available
- **Not a task scheduler** — No persistence, no retries, no queuing
- **Not a state store** — No cross-session shared state
- **Not a cognitive system** — Client makes all decisions about execution

## Architecture

All communication flows through a **single SSH exec channel**:

```
Client ←→ SSH exec channel ←→ Daemon
             (stdin/stdout)
             JSON-L RPC
```

**Message types**:
- **Requests**: `{"id": 1, "method": "spawn", "params": {...}}`
- **Responses**: `{"id": 1, "result": {...}}` or `{"id": 1, "error": {...}}`
- **Events**: `{"type": "stdout", "processId": "...", "data": "..."}`

Requests are correlated by numeric ID. Events are broadcast to all process listeners.

## Layers

| Layer | Component | Purpose |
|-------|-----------|---------|
| **User** | Your code | Call `CapsuleerClient()`, iterate process streams |
| **Client** | `CapsuleerClient` | Connection lifecycle, session creation |
| **Session** | `Session` wrapper | Process registry, event routing by processId |
| **Process** | `Process` wrapper | Async iterables, stream queuing |
| **Transport** | `RPCTransport` | SSH connection, JSON-L parsing, ID correlation |
| **Daemon** | Capsuleer daemon | RPC handling, process spawning, event emission |

## Typical Flow

```typescript
// 1. Connect
const client = CapsuleerClient({ host: '127.0.0.1', port: 22 })
const session = await client.connect('default')

// 2. Spawn
const proc = await session.spawn('shell')

// 3. Send input
await proc.stdin('echo "Hello"\n')
await proc.stdinEnd()

// 4. Consume output
for await (const chunk of proc.stdout) {
  process.stdout.write(chunk)
}

// 5. Wait for exit
const { code } = await proc.exited

// 6. Cleanup
await client.disconnect()
```

## Key Concepts

### Sessions Are Long-Lived

Sessions persist on the daemon side. Client disconnect does not terminate processes.

```typescript
await proc.detach()          // Stop observing, process keeps running
await client.disconnect()    // Daemon-side process continues
// Later: could reconnect and re-attach (not yet implemented)
```

### Streams Are Async Iterables

Every stream (`stdout`, `stderr`, `events`) is a `for await` loop. They queue data and resolve a promise when new data arrives.

```typescript
// These are equivalent
for await (const chunk of proc.stdout) { }
for await (const event of proc.events) { }
```

### Multiple Processes in One Session

```typescript
const proc1 = await session.spawn('shell')
const proc2 = await session.spawn('shell')
// Both run concurrently, events routed by processId
```

### Cleanup Is Best-Effort

All cleanup operations suppress errors for graceful degradation.

```typescript
await proc.kill()     // Errors ignored if already dead
await proc.detach()   // Errors ignored if already detached
await client.disconnect()  // Cleans up even on error
```

## Error Handling

Errors propagate via exceptions. Key error conditions:

- **Connection errors** — SSH fails or RPC attach fails
- **RPC timeouts** — Request takes >30 seconds
- **Invalid runtime** — Capsule doesn't support requested runtime
- **Stdin after detach** — Throws "Process is detached"
- **Operations after disconnect** — Session becomes inactive

## Type Safety

Key branded types prevent mixing:

```typescript
type SessionId = string & { readonly __brand: 'SessionId' }
type ProcessId = string & { readonly __brand: 'ProcessId' }
```

The compiler prevents:
```typescript
const sessionId = '123' as SessionId
const processId = '456' as ProcessId
foo(sessionId)    // ✓ OK
foo(processId)    // ✗ Error: ProcessId not assignable to SessionId
```

All process event types are discriminated unions—use `event.type` to narrow.

## What Happens Under the Hood

1. **SSH Connection**: Transport opens single exec channel to `~/.capsuleer/scripts/capsuleer.sh rpc stdio`
2. **Session Creation**: Client sends `attach-capsule` RPC, daemon creates session, returns `sessionId`
3. **Process Spawn**: Session sends `spawn` RPC with runtime, daemon creates process, returns `processId`
4. **I/O Streaming**: Daemon emits `stdout`, `stderr`, `exit` events; transport broadcasts; session routes by processId; process queues and yields
5. **Graceful Exit**: When process exits, all streams close and `proc.exited` resolves

## Next Steps

- **[Installation](/sdk/installation)** — Set up the SDK
- **[Connecting](/sdk/connecting)** — Create a client and connect
- **[Spawning Processes](/sdk/spawning-processes)** — Spawn and manage processes
- **[Stream Handling](/sdk/stream-handling)** — Consume process output
- **[Session Lifecycle](/sdk/session-lifecycle)** — Advanced session semantics
