# Transports: Local and Remote Execution

Capsules are **transport-agnostic**. The same `CapsuleInstance` interface works whether execution is local (in-process) or remote (over SSH). The API is identical—only the configuration differs.

## Quick Start

### Local Transport

```typescript
const capsule = Capsule({
  def: capsuleDef,
  transport: 'local'
})

await capsule.boot()
const result = await capsule.trigger('capability', 'operation', params)
await capsule.shutdown()
```

**When to use:**
- Development and testing
- Single-process systems
- Minimal latency required

### Remote Transport (SSH)

```typescript
const capsule = Capsule({
  def: capsuleDef,
  transport: 'ssh',
  ssh: {
    host: 'example.com',
    username: 'user',
    auth: { type: 'key', path: '~/.ssh/id_rsa' },
    capsulePath: '/usr/local/bin/capsule'
  },
  remoteName: 'my-capsule'
})

await capsule.boot()
const result = await capsule.trigger('capability', 'operation', params)
await capsule.shutdown()
```

The API is **identical**. The only differences are:
- Configuration details (host, auth, etc.)
- Operations are serialized as JSON over SSH
- Stimuli stream back asynchronously

**When to use:**
- Process isolation required
- Privilege separation needed
- Running on different machines
- Secure sandboxing

## SSH Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `host` | string | ✓ | — | SSH hostname or IP |
| `port` | number | | 22 | SSH port |
| `username` | string | ✓ | — | SSH username |
| `auth.type` | 'key' \| 'password' | ✓ | — | Authentication method |
| `auth.path` | string | if key | — | Path to private key (for key auth) |
| `auth.password` | string | if password | — | Password (for password auth) |
| `capsulePath` | string | ✓ | — | Path to capsule executable on remote |
| `workingDir` | string | | home | Working directory on remote |
| `connectTimeout` | number | | 5000 | Connection timeout in ms |

## How It Works

When you call `capsule.boot()` on a remote capsule:

1. SSH connection established to `host:port`
2. Remote shell executes: `cd <workingDir> && <capsulePath> serve <remoteName>`
3. JSONL protocol handler attaches to process stdin/stdout
4. Boot handshake exchanges metadata
5. Operations are sent as JSON, responses stream back
6. Stimuli from the remote process are streamed to local listeners

The entire lifecycle uses one SSH connection per capsule instance.

## Key Differences from Local Execution

### Serialization

Parameters and results are JSON-serialized over SSH:

```typescript
// Local: direct function call
const result = await capsule.trigger('tmux', 'create', { sessionName: 'dev' })

// Remote: params JSON-stringified, result JSON-parsed
// Type safety is preserved—TypeScript ensures params match capability definition
```

### Stimulus Flow

Stimuli are **one-way** for remote capsules (remote → local):

```typescript
capsule.onStimulus((stimulus) => {
  console.log("Received:", stimulus.sense)
})

// Only works for local capsules:
capsule.emit({ sense: 'test', data: {} })  // Throws if transport is 'ssh'
```

### Latency

Network RTT adds latency. A 10ms round trip means ~10ms latency per operation. For latency-sensitive apps, minimize cross-boundary calls.

## Common Patterns

### Cancellation

Abort signals work across the network:

```typescript
const controller = new AbortController()
setTimeout(() => controller.abort(), 5000)

try {
  const result = await capsule.trigger(
    'tmux',
    'longRunningOp',
    { duration: 30000 },
    controller.signal
  )
} catch (e) {
  console.error("Cancelled by user")
}
```

### Error Handling

Both connection and operation errors are thrown:

```typescript
try {
  await capsule.boot()  // SSH connection errors
} catch (e) {
  console.error("Connection failed:", e.message)
}

try {
  const result = await capsule.trigger('tmux', 'create', {})
} catch (e) {
  console.error("Operation failed:", e.message)  // Remote errors
}
```

### Type Safety

The `def` parameter is never sent over SSH—it's only used for compile-time type checking:

```typescript
// TypeScript verifies this at compile time
const result = await capsule.trigger('tmux', 'create', { sessionName: 'test' })

// Compile error (capability 'invalid' doesn't exist in def)
const invalid = await capsule.trigger('invalid', 'op', {})
```

## Performance & Security

### Serialization Overhead

Every operation incurs JSON encode/decode. For high-throughput scenarios, consider batching or data compression.

### SSH Key Management

- Never commit keys to version control
- Use environment variables or secure vaults for paths
- Restrict key file permissions: `chmod 600`

### Isolation

The remote capsule runs with the SSH user's privileges. Use containers, chroot, or seccomp for additional OS-level isolation if needed.

## Comparison: Local vs Remote

| Aspect | Local | Remote |
|--------|-------|--------|
| **Latency** | <1ms | 10-100ms+ (network RTT) |
| **Serialization** | None | JSON |
| **Process Isolation** | No | Yes |
| **Stimulus Flow** | Bidirectional | One-way (remote → local) |
| **Type Safety** | Full | Full (local check) |
| **Complexity** | Low | Medium (SSH setup) |

## Examples

### Local Capsule

```typescript
const capsule = Capsule({
  def: capsuleDef,
  transport: 'local'
})

await capsule.boot()
const result = await capsule.trigger('capability', 'operation', params)
await capsule.shutdown()
```

### Remote Capsule

```typescript
const capsule = Capsule({
  def: capsuleDef,
  transport: 'ssh',
  ssh: {
    host: 'devbox.example.com',
    username: 'user',
    auth: { type: 'key', path: '~/.ssh/id_rsa' },
    capsulePath: '/usr/local/bin/capsule'
  },
  remoteName: 'my-capsule'
})

await capsule.boot()
const result = await capsule.trigger('capability', 'operation', params)
await capsule.shutdown()
```

The API is identical. Configuration determines behavior.

---

## Protocol Reference

The remote capsule protocol uses **JSONL** (JSON Lines): one JSON message per line, terminated by newline.

### Message Types

**Boot** (initialization handshake)

```json
{"type": "boot", "capsuleName": "my-capsule"}
{"type": "boot", "ready": true, "metadata": {...}}
```

**Trigger** (operation invocation)

```json
{"id": "op-1", "type": "trigger", "capability": "tmux", "operation": "create", "params": {"sessionName": "dev"}}
{"id": "op-1", "type": "response", "result": {"id": "session-123"}}
```

On error:

```json
{"id": "op-1", "type": "response", "error": "Permission denied"}
```

**Stream** (operations returning multiple values)

```json
{"id": "stream-1", "type": "stream-data", "data": "line 1\n"}
{"id": "stream-1", "type": "stream-data", "data": "line 2\n"}
{"id": "stream-1", "type": "stream-end"}
```

**Stimulus** (sensory events from remote)

```json
{"type": "stimulus", "sense": "tmux:session:created", "data": {"id": "session-123"}}
```

**Abort** (cancellation)

```json
{"id": "op-1", "type": "abort", "reason": "user"}
```

**Shutdown** (graceful termination)

```json
{"type": "shutdown"}
{"type": "shutdown", "ok": true}
```

### Protocol Details

- Each message must be valid JSON on a single line
- Messages are delimited by newlines (`\n`)
- Request/response pairs use a correlation ID
- Stimulus events are unbounded (arrive asynchronously)
- The protocol is transport-agnostic (works over any bidirectional stream)
