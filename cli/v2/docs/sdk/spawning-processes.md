# Spawning Processes

## Basic Spawn

To spawn a process in a session:

```typescript
const proc = await session.spawn('shell')
```

When you call `spawn(runtime)`:

1. **RPC spawn sent** — Client sends `{"id": 2, "method": "spawn", "params": {"runtime": "shell"}}`
2. **Process created** — Daemon instantiates runtime, assigns processId
3. **Event listeners registered** — Session routes subsequent events (stdout, stderr, exit) by processId
4. **Process wrapper returned** — You receive `Process` interface for I/O and lifecycle control

## Process Interface

```typescript
interface Process {
  id: ProcessId                              // Unique process identifier
  stdin(data: string | Uint8Array): Promise<void>  // Send input
  stdinEnd(): Promise<void>                  // Signal EOF
  kill(): Promise<void>                      // Terminate process
  detach(): Promise<void>                    // Stop observing (process keeps running)
  status(): Promise<ProcessStatus>           // Query process state

  // Async iterables (see Stream Handling)
  stdout: AsyncIterable<Uint8Array>          // Standard output
  stderr: AsyncIterable<Uint8Array>          // Standard error
  events: AsyncIterable<ProcessEvent>        // All events

  // Lifecycle
  exited: Promise<{ code: number; signal?: string }>  // Resolves when process exits
}
```

## Runtimes

Supported runtimes are defined by the capsule blueprint. Common runtimes:

- **`shell`** — POSIX shell (bash, sh)
- **`typescript`** — TypeScript via `node-repl`
- **Custom runtimes** — Defined in capsule blueprint

```typescript
const shellProc = await session.spawn('shell')
const tsProc = await session.spawn('typescript')
```

**Invalid runtime throws error**:

```typescript
try {
  const proc = await session.spawn('python')  // Not available
} catch (err) {
  console.error(err.message)  // "INVALID_RUNTIME: Unknown runtime 'python'"
}
```

## Concurrent Processes

Multiple processes can run simultaneously in one session:

```typescript
const proc1 = await session.spawn('shell')
const proc2 = await session.spawn('shell')
const proc3 = await session.spawn('shell')

// All run concurrently; events routed by processId
await proc1.stdin('echo "1"\n')
await proc2.stdin('echo "2"\n')
await proc3.stdin('echo "3"\n')
```

Events from different processes never interfere because the session routes by `processId`.

## Sequential Processes

Spawn processes one after another:

```typescript
const commands = ['ls', 'pwd', 'whoami']

for (const cmd of commands) {
  const proc = await session.spawn('shell')
  await proc.stdin(cmd + '\n')
  await proc.stdinEnd()
  const { code } = await proc.exited
  console.log(`Command exited with code ${code}`)
}
```

## Parallel Process Groups

Use Promise.all() to spawn multiple and wait for all to complete:

```typescript
const procs = await Promise.all([
  session.spawn('shell'),
  session.spawn('shell'),
  session.spawn('shell'),
])

// Send commands
procs.forEach((proc, i) => {
  proc.stdin(`echo "Task ${i}"\n`)
})

// Wait for all to exit
await Promise.all(procs.map(p => p.exited))
```

## Process Lifecycle

### Creation
Process is created when `spawn()` returns. All streams are immediately available.

### Input
Send data via `stdin()`:

```typescript
await proc.stdin('echo "hello"\n')
```

Signal end-of-input via `stdinEnd()`:

```typescript
await proc.stdinEnd()
```

After `stdinEnd()`, process receives EOF on stdin. **Do not** call `stdin()` after `stdinEnd()` (throws error).

### Output
Process outputs to stdout/stderr. See [Stream Handling](/sdk/stream-handling).

### Exit
Process exits when runtime terminates. The `exited` promise resolves:

```typescript
const { code, signal } = await proc.exited
console.log(`Process exited with code ${code}`)
```

- `code`: Exit code (0 for success, non-zero for error)
- `signal`: If killed by signal (e.g., "SIGTERM"), this field is set

## Termination

### Normal Exit
Process exits on its own:

```typescript
await proc.stdinEnd()
const { code } = await proc.exited
```

### Forced Kill
Terminate process immediately:

```typescript
await proc.kill()
```

When killed, `exited` resolves with signal (e.g., `{ signal: 'SIGKILL' }`).

**Kill is best-effort**: If process already exited, error is suppressed.

## Error Conditions

### Spawn Fails

```typescript
try {
  const proc = await session.spawn('shell')
} catch (err) {
  // Runtime not found, mediation rejected, permission denied
  console.error('Spawn failed:', err.message)
}
```

Common causes:
- Runtime not in capsule blueprint
- Mediation policy rejected spawn
- Permission denied
- Resource limit reached

### Session Inactive

```typescript
const session = await client.connect('default')
await client.disconnect()

const proc = await session.spawn('shell')  // Throws: Session not active
```

### Stdin After Detach

```typescript
const proc = await session.spawn('shell')
await proc.detach()
await proc.stdin('data')  // Throws: Process is detached
```

See [Session Lifecycle](/sdk/session-lifecycle) for detach semantics.

## Next Steps

- **[Stream Handling](/sdk/stream-handling)** — Consume process output via streams
- **[Session Lifecycle](/sdk/session-lifecycle)** — Advanced session and process semantics
