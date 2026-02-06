# Session Lifecycle

## Sessions Are Long-Lived

Sessions persist on the daemon side. They are **not** destroyed when the client disconnects.

```typescript
const session = await client.connect('capsule-a')
const proc = await session.spawn('shell')

// Do some work...

await client.disconnect()
// daemon-side session still exists
// process still running on daemon
```

This enables agent workflows:

1. **Spawn task** → `const proc = await session.spawn('shell')`
2. **Detach** → `await proc.detach()`
3. **Disconnect** → `await client.disconnect()`
4. Later...
5. **Reconnect** (future) → `const session = await client2.reconnect(sessionId)`
6. **Re-attach** (future) → `const proc = await session.attach(processId)`

## Process Ownership

All processes belong to their session:

```
Session (owned by client)
  ├── Process 1 (shell)
  ├── Process 2 (shell)
  └── Process 3 (typescript)
```

When a process exits, it's cleaned up by the session. Session holds process references until they exit.

## Detach: Stop Observing, Keep Running

To stop observing a process but let it keep running:

```typescript
const proc = await session.spawn('shell')
await proc.stdin('nohup sleep 100 &\n')
await proc.detach()

// Process now runs in background
// Client no longer observes it
```

After detach:

- **Process keeps running** on the daemon
- **Streams close** (`stdout`, `stderr`, `events`)
- **stdin throws** if called again: "Process is detached"
- **kill/detach are no-ops** (errors suppressed)
- **status still works** (queries daemon)

**Use case**: Spawn background tasks that survive client disconnect.

```typescript
const proc = await session.spawn('shell')
await proc.stdin('nohup my-long-task.sh > /tmp/output.log 2>&1 &\n')
await proc.detach()
await client.disconnect()

// my-long-task.sh runs on daemon
// Client can disconnect and do other work
```

## Session Kill: Cascade Termination

To terminate a session and all its processes:

```typescript
await session.kill()
```

This:

1. **Marks session inactive** — `session.isActive()` returns false
2. **Kills all owned processes** — Every spawned process sent SIGKILL
3. **Closes all streams** — All `stdout`, `stderr`, `events` iterables exit
4. **Suppresses errors** — If processes already dead, errors ignored

After kill, the session is unusable:

```typescript
await session.kill()
const proc = await session.spawn('shell')  // Throws: Session not active
```

## Client Disconnect: Implicit Session Kill

When you call `client.disconnect()`:

```typescript
await client.disconnect()
```

This automatically calls `session.kill()`:

1. All processes are terminated
2. SSH channel closes
3. Transport cleans up

**Note**: Cleanup errors are suppressed for graceful degradation.

## Cleanup Best-Effort Pattern

All cleanup operations suppress errors:

```typescript
// ✓ No error even if process already dead
await proc.kill()

// ✓ No error even if process already detached
await proc.detach()

// ✓ No error even if session already killed
await session.kill()

// ✓ No error even if already disconnected
await client.disconnect()
```

This prevents cleanup exceptions from propagating:

```typescript
try {
  await doWork()
} finally {
  // Guaranteed not to throw
  await session.kill()
  await client.disconnect()
}
```

## Process Status

Query process state without observing it:

```typescript
const status = await proc.status()
```

Returns:

```typescript
interface ProcessStatus {
  processId: ProcessId
  state: 'running' | 'exited' | 'error'
  exitCode?: number      // If exited
  signal?: string        // If killed by signal
  createdAt: number      // Unix timestamp
  exitedAt?: number      // Unix timestamp
}
```

**Use case**: Check if background process is still running:

```typescript
const proc = await session.spawn('shell')
await proc.stdin('sleep 100 &\n')
await proc.detach()

// Later...
const status = await proc.status()
if (status.state === 'running') {
  console.log('Process still running')
}
```

## Session State

Check if session is still active:

```typescript
if (session.isActive()) {
  // Can spawn new processes
  const proc = await session.spawn('shell')
}
```

Returns false after:

- `session.kill()`
- `client.disconnect()`
- Server error or timeout

## Reconnection (Future)

**Currently not implemented**, but the architecture supports it.

Future pattern:

```typescript
// Current session
const session = await client.connect('capsule-a')
const sessionId = session.id
const proc = await session.spawn('shell')
await proc.detach()
await client.disconnect()

// Later reconnection (not yet possible)
const client2 = CapsuleerClient({ host: 'localhost' })
const session2 = await client2.reconnect(sessionId)
const status = await proc.status()  // Process still running!
```

This would allow:
- Disconnecting and reconnecting without losing background processes
- Querying process status without active client
- Re-attaching to running processes

## Error Conditions

### Spawn After Kill

```typescript
const session = await client.connect('capsule-a')
await session.kill()
const proc = await session.spawn('shell')  // Throws: Session not active
```

### Stdin After Detach

```typescript
const proc = await session.spawn('shell')
await proc.detach()
await proc.stdin('data')  // Throws: Process is detached
```

### Status After Disconnect

```typescript
const proc = await session.spawn('shell')
await client.disconnect()
const status = await proc.status()  // Throws: Session not active
```

## Typical Cleanup Pattern

```typescript
try {
  const client = CapsuleerClient({ host: 'localhost' })
  const session = await client.connect('capsule-a')

  // Do work...
  const proc = await session.spawn('shell')
  await proc.stdin('command\n')
  const { code } = await proc.exited

} catch (err) {
  console.error('Error:', err.message)

} finally {
  // Cleanup is best-effort and guaranteed not to throw
  await session?.kill()
  await client?.disconnect()
}
```

## Next Steps

- **[SDK Examples](/api/examples/patterns)** — See patterns in action
