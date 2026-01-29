# Transports: SSH Server Configuration

A capsule instance is always created locally via `Capsule(def)`. To make it accessible to remote clients, add an SSH server configuration to the capsule definition.

## Quick Start

### Capsule Without SSH Server

```typescript
const capsule = Capsule({
  name: 'my-capsule',
  capabilities: [capability1, capability2]
})

await capsule.boot()
const result = await capsule.trigger('capability', 'operation', params)
await capsule.shutdown()
```

Only local code can invoke operations.

### Capsule With SSH Server

```typescript
const capsule = Capsule({
  name: 'my-capsule',
  capabilities: [capability1, capability2],
  ssh: {
    host: '0.0.0.0',
    port: 2222,
    auth: { type: 'key', path: '/path/to/private/key' },
    // Other SSH server options...
  }
})

await capsule.boot()  // SSH server starts automatically
// Remote clients can now connect and invoke operations
await capsule.shutdown()  // SSH server stops
```

When `ssh` is configured, an SSH server starts during `boot()` that accepts remote connections. Remote clients connect to the SSH server and invoke operations over the encrypted channel.

**When to add SSH server:**
- Expose capsule to remote processes
- Privilege separation (SSH user runs with different permissions)
- Network isolation and encryption
- Multi-machine deployments

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

## How SSH Server Works

When you include `ssh` in the capsule definition and call `boot()`:

1. SSH server starts listening on the configured `host:port`
2. Remote clients can establish SSH connections
3. Upon connection, clients are authenticated (key or password)
4. Clients send JSONL-formatted operation requests
5. Server processes requests, sends JSONL responses
6. Stimulus events are streamed to connected clients
7. On `shutdown()`, the SSH server closes and stops accepting connections

## Considerations

### Serialization Overhead

When an SSH server is configured, all operations are JSON-serialized over the network. For high-throughput scenarios, consider:
- Batching operations
- Compressing large data in stimulus responses
- Using dedicated streaming channels if latency is critical

### Network Latency

Network RTT adds latency. A 10ms round trip means ~10ms additional latency per operation. For latency-sensitive applications, minimize operations that cross the SSH boundary.

### SSH Key Management

Store SSH credentials securely:
- Never commit keys to version control
- Use environment variables or secure vaults for key paths
- Restrict key file permissions: `chmod 600`
- Consider rotating keys regularly

### Process Isolation

The SSH server runs with the privileges of the SSH user. For additional hardening:
- Run the capsule in a container (Docker, etc.)
- Use OS-level sandboxing (chroot, seccomp, AppArmor)
- Restrict the SSH user's capabilities and file access
- Monitor resource usage (CPU, memory, disk)

---

## SSH Protocol Reference

When an SSH server is configured, clients communicate with it using the **JSONL** protocol: one JSON message per line, terminated by newline. This is an implementation detail—you typically don't interact with this directly unless building a custom client.

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
