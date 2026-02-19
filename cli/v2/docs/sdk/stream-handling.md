# Stream Handling

## Async Iterables

All process streams are **async iterables**. Consume them with `for await...of`:

```typescript
for await (const chunk of proc.stdout) {
  process.stdout.write(chunk)
}
```

This pattern:
- Queues incoming data
- Resolves a waiting promise when data arrives
- Yields chunks one at a time
- Closes when process exits
- Requires no manual buffering

## Stream Types

### stdout

Standard output from the process:

```typescript
for await (const chunk of proc.stdout) {
  console.log('stdout:', chunk)  // Uint8Array
}
```

Data is returned as `Uint8Array` (binary-safe). Decode if needed:

```typescript
const decoder = new TextDecoder()
for await (const chunk of proc.stdout) {
  console.log(decoder.decode(chunk))
}
```

### stderr

Standard error from the process:

```typescript
for await (const chunk of proc.stderr) {
  console.error('stderr:', chunk)
}
```

Same as stdout: binary `Uint8Array` chunks.

### events

All events (stdout, stderr, exit, error) in a single stream:

```typescript
for await (const event of proc.events) {
  if (event.type === 'stdout') {
    // console.log('stdout:', event.data)  // Uint8Array
  } else if (event.type === 'stderr') {
    // console.log('stderr:', event.data)
  } else if (event.type === 'exit') {
    // console.log('exit:', event.code)
  } else if (event.type === 'error') {
    // console.error('error:', event.message)
  }
}
```

## Event Types

```typescript
type ProcessEvent =
  | { type: 'stdout'; data: Uint8Array }
  | { type: 'stderr'; data: Uint8Array }
  | { type: 'exit'; code: number; signal?: string }
  | { type: 'error'; message: string }
```

Use the `type` field to discriminate:

```typescript
for await (const event of proc.events) {
  switch (event.type) {
    case 'stdout':
      // event.data is available
      break
    case 'exit':
      // event.code is available
      break
  }
}
```

## Choosing Streams

### Use stdout/stderr When
- You only care about output, not exit code
- You want separate handling for stdout and stderr
- You want cleaner consumer code

```typescript
// Collect all stdout
const lines = []
for await (const chunk of proc.stdout) {
  lines.push(chunk)
}
```

### Use events When
- You need to handle output AND exit code in one loop
- You need to react to specific events
- You want unified event handling

```typescript
let lastOutput = null
for await (const event of proc.events) {
  if (event.type === 'stdout' || event.type === 'stderr') {
    lastOutput = event.data
  } else if (event.type === 'exit') {
    console.log('Final output:', lastOutput, 'code:', event.code)
  }
}
```

## Stream Lifecycle

### Opening
Streams are created when `spawn()` returns. Both stdout and events are immediately available:

```typescript
const proc = await session.spawn('shell')
// proc.stdout and proc.events ready to consume
```

### Data Flow
As the daemon emits data:

1. **Daemon sends event** — `{"type": "stdout", "processId": "...", "data": "base64-encoded"}`
2. **Transport broadcasts** — All event listeners receive it
3. **Session routes by processId** — Event goes to correct process
4. **Process queues** — Chunk added to internal queue
5. **Promise resolved** — Waiting consumer wakes up
6. **Iterable yields** — Next `for await` iteration gets chunk

### Closing
When process exits or errors:

1. **Exit/error event sent** — Daemon notifies client
2. **All streams marked done** — `stdout`, `stderr`, `events` all close
3. **Pending promises resolved** — Any waiting consumers wake up
4. **Iterables exit** — `for await` loops complete

## Data Encoding

Data is base64-encoded on the wire:

```json
{ "type": "stdout", "processId": "123", "data": "SGVsbG8gV29ybGQ=" }
```

The SDK automatically decodes to `Uint8Array`:

```typescript
for await (const chunk of proc.stdout) {
  // chunk is Uint8Array, already decoded
}
```

## Multiple Consumers

You can consume stdout and stderr simultaneously:

```typescript
// Start both consumers in parallel
const stdoutPromise = (async () => {
  for await (const chunk of proc.stdout) {
    console.log('stdout:', chunk)
  }
})()

const stderrPromise = (async () => {
  for await (const chunk of proc.stderr) {
    console.error('stderr:', chunk)
  }
})()

await Promise.all([stdoutPromise, stderrPromise])
```

## Important: Don't Mix stdout and events

You **cannot** consume both `proc.stdout` and `proc.events` simultaneously:

```typescript
// ✗ WRONG: unpredictable behavior
for await (const chunk of proc.stdout) {
  // might not receive all data
}
for await (const event of proc.events) {
  // might not receive all events
}
```

Choose one or the other. If you need both, use `events`:

```typescript
// ✓ RIGHT: use events for both
for await (const event of proc.events) {
  if (event.type === 'stdout') {
    console.log(event.data)
  } else if (event.type === 'exit') {
    console.log(event.code)
  }
}
```

## Error Events

If the process encounters an error, an error event is emitted:

```typescript
for await (const event of proc.events) {
  if (event.type === 'error') {
    console.error('Process error:', event.message)
  }
}
```

Error events are rare and indicate daemon-side failures.

## Combining with Other Promises

Wait for process exit while consuming streams:

```typescript
const exitPromise = proc.exited

const streamPromise = (async () => {
  for await (const chunk of proc.stdout) {
    process.stdout.write(chunk)
  }
})()

const { code } = await Promise.race([exitPromise, streamPromise])
console.log('Process exited with code:', code)
```

Or consume streams separately from waiting for exit:

```typescript
proc.stdout.forEach(chunk => process.stdout.write(chunk))
const { code } = await proc.exited
```

## Next Steps

- **[Session Lifecycle](/sdk/session-lifecycle)** — Detach, cleanup, and long-lived sessions
