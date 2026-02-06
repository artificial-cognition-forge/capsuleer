# Daemon Overview

The Capsuleer daemon is the **root runtime authority**. It loads capsules, exposes them over SSH, creates sessions, spawns processes, multiplexes streams, and enforces session isolation.

## What the Daemon Does

**Core responsibilities:**

- **Capsule lifecycle** — Boot and shutdown all registered capsules
- **Session management** — Create and manage RPC sessions (one per capsule per registry)
- **Process spawning** — Instantiate runtimes (shell, typescript, custom) within capsule sessions
- **Stream multiplexing** — Subscribe to process streams, fan-out events to attached SSH transports
- **RPC handling** — Accept JSON-L requests over SSH stdio (`~/.capsuleer/scripts/capsuleer.sh rpc stdio`)
- **Event logging** — Append all significant operations to JSONL trace file
- **SSH integration** — Manage authorized keys for client authentication

## What the Daemon Is NOT

- **Not an SSH server** — Uses OpenSSH; daemon does not handle protocol
- **Not a capability enforcer** — Mediation is delegated to capsule blueprints
- **Not persistent** — Sessions are in-memory; restarts lose session history
- **Not a scheduler** — No retry, backoff, or long-term job management
- **Not a cognitive system** — Receives explicit commands; makes no decisions

## Architecture

```
Daemon Process
  ├── CapsuleManager
  │   ├── Capsule: "default"
  │   ├── Capsule: "custom"
  │   └── ...
  ├── RPC Session Registry
  │   ├── RPC Session (capsule-a)
  │   │   ├── Capsule Session (internal)
  │   │   │   ├── Process 1 (shell)
  │   │   │   ├── Process 2 (shell)
  │   │   │   └── ...
  │   │   └── Transport Pool (multiple SSH clients)
  │   └── ...
  ├── Trace Logger
  │   └── JSONL event log
  └── Signal Handlers (SIGTERM, SIGINT)
```

**Layers:**

| Layer | Component | Responsibility |
|-------|-----------|---|
| **Clients** | SDK, agents, CLI | Send RPC requests, consume streams |
| **RPC Handler** | handleRPCStdio | Parse JSON-L, route requests, send responses |
| **Sessions** | RPC session registry | Create/manage sessions, spawn processes, fan-out events |
| **Processes** | Bun.Subprocess wrappers | Execute runtimes, stream I/O, track lifecycle |
| **Capsules** | User-defined blueprints | Define capability surface, validate requests |
| **Runtimes** | shell, typescript, custom | Interpret and execute commands |
| **Transport** | SSH stdio | Secure channel, authentication, stream encoding |

## Daemon Lifecycle

### Boot Sequence

1. Generate UUIDv7 as daemon instance ID
2. Create trace logger singleton
3. Load capsule registry (hardcoded for now; will be disk-based)
4. Instantiate each capsule via its blueprint
5. Call `capsuleManager.start()` → calls `.start()` on each capsule
6. Write SSH authorized keys to `~/.ssh/authorized_keys`
7. Install systemd/launchd service (optional)
8. Register SIGTERM/SIGINT handlers
9. Block forever, accepting RPC connections

### Shutdown Sequence

1. Signal handler catches SIGTERM/SIGINT
2. Call `capsuleManager.stop()` → calls `.stop()` on each capsule
3. Gracefully close active RPC sessions
4. Exit with code 0

## Sessions: Tenancy Boundaries

Each RPC connection creates **one implicit session per capsule**:

```typescript
// First RPC request from client
{ "method": "attach-capsule", "params": { "capsuleId": "default" } }

// Daemon creates or returns existing session
// All subsequent requests from that transport use that session
```

**Session invariants:**

- **Isolated ownership** — Each session owns its processes; sessions cannot interfere
- **Long-lived** — Sessions survive transport disconnect; processes keep running
- **Multiple transports** — Multiple SSH clients can attach to same session, observe/control processes
- **Single session per transport** — Each SSH connection holds one session per capsule (not multiple)

```
Daemon
  └── Session (capsule-a)
      ├── Process 1
      ├── Process 2
      └── Transport Pool
          ├── Transport 1 (SSH client A)
          ├── Transport 2 (SSH client B, debugging)
          └── Transport 3 (SSH client C, monitoring)
```

All events from Process 1 and 2 fan-out to all three transports.

## Process Spawning

When a client calls `session.spawn(runtime)`:

1. Daemon validates session is active
2. Routes to appropriate spawner (shell, typescript, custom)
3. Spawner calls `Bun.spawn()` with args/env/streams
4. Daemon wraps subprocess with metadata (ID, runtime, address)
5. Subscribes to subprocess streams (fire-and-forget async generators)
6. Returns `{ processId }`

**Supported runtimes:**

- **`shell`** — POSIX shell (bash, sh). Reads commands from stdin, executes via eval.
- **`typescript`** — Node.js REPL. Evaluates TypeScript/JavaScript expressions.
- **Custom** — Defined in capsule blueprint. Can be any executable.

## Stream Multiplexing

**Event Flow:**

```
Process stdout ──→ Async generator ──→ Session.emitEvent() ──┐
                                                              ├──→ Transport 1 stdout
Process stderr ──→ Async generator ──→ Session.emitEvent() ──┤
                                                              ├──→ Transport 2 stdout
Process exit   ──→ Promise           ──→ Session.emitEvent() ──┤
                                                              └──→ Transport 3 stdout
```

**How it works:**

1. **Subscription** (fire-and-forget):
   - Daemon starts async tasks: one for stdout, one for stderr, one waiting for exit
   - Each task iterates over its stream, collecting chunks
   - No backpressure; chunks buffered in memory

2. **Event Emission**:
   - Each chunk becomes an event: `{ type: 'stdout', processId: '...', data: 'base64' }`
   - Session encodes as JSON-L and writes to **all attached transports** simultaneously
   - Each transport write is best-effort (errors logged, don't break event emission)

3. **Data Encoding**:
   - Process streams are `Uint8Array` (binary-safe)
   - Encoded to base64 for JSON wire format
   - Clients decode on receive

**Why fire-and-forget:**

- Daemon doesn't wait for client to consume events
- Events queue in transport buffers (OS-level pipes)
- Backpressure handled by OS; daemon continues
- Multiple clients don't slow each other down

## Error Handling

**RPC Request Errors:**

```json
{ "id": 1, "error": { "code": "INVALID_RUNTIME", "message": "Runtime 'python' not found" } }
```

Common error codes:
- `PARSE_ERROR` — Invalid JSON on wire
- `INVALID_REQUEST` — Missing required fields
- `NO_SESSION` — No session attached; call attach-capsule first
- `INVALID_RUNTIME` — Runtime not in capsule blueprint
- `SESSION_INACTIVE` — Session killed or daemon shutting down
- `PROCESS_NOT_FOUND` — Process doesn't exist or already exited

**Stream Errors:**

If a process stream encounters an error:

```json
{ "type": "error", "processId": "123", "message": "stdin read failed" }
```

Stream errors don't crash the daemon. Process continues; error event emitted to clients.

**Fatal Errors:**

Uncaught errors in RPC request loop log to stderr and exit daemon (code 1).

## Observability

**Trace Log:**

All operations append events to JSONL log:

```jsonl
{"eventId": "...", "type": "daemon.started", "time": {"ms": 1707000000000, "seq": 0}}
{"eventId": "...", "type": "capsule.boot", "capsuleId": "default", "time": {"ms": 1707000000001, "seq": 1}}
{"eventId": "...", "type": "rpc.session.attach", "sessionId": "abc123", "time": {"ms": 1707000000002, "seq": 2}}
{"eventId": "...", "type": "rpc.process.spawn", "processId": "def456", "runtime": "shell", "time": {"ms": 1707000000003, "seq": 3}}
{"eventId": "...", "type": "rpc.stream.data", "processId": "def456", "type": "stdout", "bytes": 42, "time": {"ms": 1707000000004, "seq": 4}}
```

**Event Categories:**

- `daemon.*` — Daemon lifecycle (started, stopped, restarted)
- `capsule.*` — Capsule operations (boot, shutdown, session creation)
- `rpc.*` — RPC request/response, session/process operations, stream events
- `ctl.*` — Service installation (systemd/launchd setup)
- `sdk.*` — SDK client perspective (for tracing client operations)

View logs: `capsuleer tail`

## Next Steps

- **[CLI Reference](/daemon/cli-reference)** — Command reference
- **[Capsule Overview](/capsule/overview)** — Creating capsules
