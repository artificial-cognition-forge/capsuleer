# Connecting

Once you have a CapsuleerClient

## Creating a Client

Creating a `CapsuleerClient` does **not** establish a connection:

```typescript
const client = CapsuleerClient({ host: 'localhost' })
```

The client is inert until you call `connect()`.

## Connecting to a Capsule

To connect and create a session:

```typescript
const session = await client.connect('default')
```

When you call `connect()`:

1. **SSH connection opens** — Transport opens exec channel to `~/.capsuleer/scripts/capsuleer.sh rpc stdio`
2. **RPC attach-capsule sent** — Client sends `{"id": 1, "method": "attach-capsule", "params": {"capsuleId": "default"}}`
3. **Session created** — Daemon creates session, returns sessionId
4. **Event listeners registered** — Transport subscribes to daemon events; session routes by processId
5. **Session wrapper returned** — You receive `Session` interface with `spawn()`, `kill()`, `isActive()` methods

## Session Interface

```typescript
interface Session {
  id: SessionId                           // Unique session identifier
  capsuleId: string                       // Capsule name
  spawn(runtime: string): Promise<Process> // Spawn a process
  kill(): Promise<void>                   // Terminate session and all processes
  isActive(): boolean                     // True if not killed
}
```

## Error Conditions

### SSH Connection Fails

```typescript
try {
  const session = await client.connect('default')
} catch (err) {
  // SSH unreachable, wrong credentials, key not found, etc.
  console.error('SSH connection failed:', err.message)
}
```

Common causes:
- Host unreachable
- SSH server not running
- Authentication failed (wrong key, password)
- SSH exec script not found on target

### RPC Attach Fails

```typescript
try {
  const session = await client.connect('unknown-capsule')
} catch (err) {
  // Capsule not found, permission denied, etc.
  console.error('Capsule attach failed:', err.message)
}
```

Common causes:
- Capsule does not exist
- Daemon not running
- Permission denied (wrong user)

### RPC Timeout

```typescript
try {
  const session = await client.connect('default')
} catch (err) {
  // RPC took >30 seconds
  console.error('Connection timeout')
}
```

**Note**: Timeout is 30 seconds by default, configurable via `CapsuleerClient` options.

## One Session Per Client

Each client instance holds one session:

```typescript
const session1 = await client.connect('capsule-a')
// session1 is stored in client.currentSession

const session2 = await client.connect('capsule-b')
// session2 replaces session1
// session1 becomes unusable
```

To use multiple sessions simultaneously, create multiple clients:

```typescript
const client1 = CapsuleerClient({ host: 'localhost' })
const client2 = CapsuleerClient({ host: 'localhost' })

const session1 = await client1.connect('capsule-a')
const session2 = await client2.connect('capsule-b')
// Both sessions active concurrently
```

## Checking Connection State

```typescript
if (client.isConnected()) {
  // Transport has active SSH connection
}
```

Returns true if transport is connected; false if not.

## Disconnecting

To cleanly terminate the session and close SSH:

```typescript
await client.disconnect()
```

This:
1. **Kills session** — All owned processes terminated
2. **Clears pending requests** — Any in-flight RPC calls rejected
3. **Closes SSH channel** — Transport disconnects
4. **Suppresses errors** — Cleanup errors are ignored

**Important**: After disconnect, the client is unusable. Create a new `CapsuleerClient` to reconnect.

## Re-connecting

After disconnect, reconnect by creating a new client:

```typescript
const client1 = CapsuleerClient({ host: 'localhost' })
const session1 = await client1.connect('capsule-a')
await client1.disconnect()

const client2 = CapsuleerClient({ host: 'localhost' })
const session2 = await client2.connect('capsule-a')  // Fresh connection
```

**Future enhancement**: Session persistence would allow reconnecting to the same daemon-side session without losing processes.

## Next Steps

- **[Spawning Processes](/sdk/spawning-processes)** — Spawn processes in a session
