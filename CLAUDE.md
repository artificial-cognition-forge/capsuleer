## Capsuleer — System Mental Model

Capsuleer is a **multiplexed remote embodiment runtime** for AI agents. It exposes controlled OS-level execution environments (“Capsules”) over SSH while enforcing mediation, session isolation, and capability boundaries.

Capsuleer is NOT:

* A container orchestrator
* A generic SSH wrapper
* A task runner
* A deployment system
* A cognition or planning system

Capsuleer is strictly responsible for **controlled remote execution embodiment**.

## Core Ontology

### Daemon

The Capsuleer daemon is the root runtime authority.

Responsibilities:

* Loads and manages capsules
* Exposes capsules over SSH
* Owns authentication and identity negotiation
* Owns capsule lifecycle
* Owns session creation
* Multiplexes process streams
* Enforces mediation and policy

The daemon is the only long-lived system process.

Clients never interact with capsules directly. All access flows through the daemon.

**CLI Methods**

- up: start daemon
- down: stop daemon
- ls: list running capsules
- attach <conn-string>: attach to a running capsule (human entry point)
- tail: tail the daemon log

### Capsule

A Capsule is a **bounded execution environment** with defined capabilities and mediation rules.

Capsules define:

* Available runtimes
* Capability APIs
* Process spawning rules
* Security mediation
* Environment configuration

Capsules MUST NOT:

* Contain client logic
* Persist session state
* Maintain cross-session shared process ownership
* Directly expose OS primitives without mediation

Capsules are loaded from a **Capsule Blueprint**.

### Capsule Blueprint

A Capsule Blueprint is a TypeScript-defined specification describing:

* Capability surface
* Runtime configuration
* Mediation policies
* Allowed process types
* Environment behavior

Blueprints are declarative contracts. They do NOT execute client workflows.

Blueprints define *what is allowed*, not *when it is used*.

### Session

A Session is a **single authenticated tenant binding** between a client and a capsule.

Session invariants:

* Sessions are isolated from each other
* Sessions own their spawned processes
* Processes terminate when the session ends
* Sessions cannot access processes from other sessions
* Sessions cannot modify capsule configuration

Sessions are the primary tenancy boundary.

### Process

A Process is a runtime execution instance spawned inside a session.

Processes:

* Are stream-based
* Are bound to session lifetime
* Provide stdin / stdout / stderr streams
* Provide lifecycle state
* May be interactive or batch

Processes MUST NOT outlive their session.

## Hierarchical Model

```
Daemon
  → Capsules
      → Sessions
          → Processes
              → Streams
```

Ownership is strictly top-down.

No lower layer may own or reference higher-layer lifecycle state.

## Transport Model

Capsuleer uses SSH as a secure transport and identity channel.

SSH is considered:

* A connection substrate
* An authentication mechanism
* A stream transport

SSH is NOT part of Capsuleer’s capability semantics.

Capsule capability logic must remain transport-agnostic.

## Stream Model

All process I/O is modeled as asynchronous streams.

Streams are:

* Session scoped

Streams are the primary output interface.

Processes MUST NOT expose synchronous output APIs that bypass streams.

## Mediation Model

All OS-level execution must pass through mediation layers defined by the capsule blueprint.

Mediation may:

* Allow execution
* Transform execution parameters
* Require approval
* Deny execution
* Log execution intent

No process may be spawned without mediation.

## Trace

The Capsuleer daemon writes all meaningful events to a JSONL log file.

```ts
const t = trace() // singleton

t.append({
  type: "capsule.boot",
  capsuleId: "default",
})
```

## Identity & Authentication

Authentication is owned exclusively by the daemon.

Clients:

* Request session attachment
* Reference identities abstractly
* Never handle credential material

Credential storage, negotiation, and rotation are daemon responsibilities.

## Lifecycle Invariants

### Daemon

* Must be restartable without corrupting capsule definitions
* Owns capsule boot and shutdown

### Capsule

* Must be bootable independently
* Must not maintain persistent session state
* Must tolerate multiple concurrent sessions

### Session

* Created only after authentication
* Destroyed on client disconnect or explicit termination
* Owns all spawned processes

### Process

* Cannot exist without session
* Must terminate on session destruction

## Responsibility Boundaries

### Capsuleer Responsibilities

* Remote embodiment
* Execution mediation
* Session tenancy
* Process multiplexing
* Stream routing
* Identity handling

### Client Responsibilities

* Cognitive decision making
* Capability selection
* Workflow orchestration
* Session usage

## Non-Goals

Capsuleer intentionally does NOT:

* Schedule long-term jobs
* Maintain distributed state between capsules
* Provide cluster orchestration
* Perform cognition or planning
* Store agent memory
* Implement container runtime semantics

## Design Constraints

1. All execution must be session scoped
2. All OS interaction must be mediated
3. Transport must remain replaceable
4. Streams are first-class primitives
5. Identity must remain daemon-owned
6. Capsules must remain deterministic and declarative
7. Cross-session resource sharing is forbidden unless explicitly mediated

## Failure Model

Capsuleer prioritizes:

* Session isolation over process persistence
* Deterministic teardown over graceful degradation
* Explicit mediation failures over implicit fallback

## Mental Model Summary

Capsuleer is a **secure embodiment router** that transforms authenticated client intent into mediated OS execution within bounded, session-scoped environments.

## Capsuleer SDK

**Purpose**: Programmatic client interface to the daemon. Hides SSH transport complexity and multiplexes process I/O back to clients (agents, tools, remote scripts).

**Client Model**: Thin faithful mapping of daemon ontology:
```
Client → connect(capsule) → Session → spawn(runtime) → Process → events
```

**Design Principles**:

- **Implicit sessions**: Every connection = one session. Implicit creation on `connect()` reduces API friction and aligns with "one connection, one tenant" semantics.
- **Long-lived sessions**: Sessions survive SSH disconnect, enabling agents to spawn background processes and reconnect later.
- **Event multiplexing**: All process I/O (stdout, stderr, exit, error) streamed over single RPC channel and routed client-side by processId.
- **Client-driven lifecycle**: `process.detach()` stops observing but process keeps running; `process.kill()` terminates. Agents choose their cleanup strategy.
- **Mediation at REPL layer**: Mediation (validation, transformation, denial) happens at REPL instantiation, not SDK layer. SDK only routes execution intent.
- **No handshakes**: Assumes SSH auth socket exists and valid credentials are available externally. SDK focuses on execution, not authentication.

**RPC Contract** (JSON-L over SSH exec stdio):

- **Transport**: Single SSH exec channel: `~/.capsuleer/scripts/capsuleer.sh rpc stdio`. Daemon listens on stdin, sends framed JSON-L responses and events to stdout.
- **Request/Response**: Correlation IDs enable parallel requests. Format: `{"id": 1, "method": "spawn", "params": {...}}` → `{"id": 1, "result": {...}}` or `{"id": 1, "error": {...}}`
- **Methods**: `attach-capsule(capsule)`, `spawn(runtime)`, `stdin(processId, data)`, `kill(processId)`, `detach(processId)`, `status(processId)`
- **Events**: Unidirectional daemon→client streams (no request ID needed): `{"type": "stdout|stderr|exit|error", "processId": "...", "sessionId": "...", "capsuleId": "...", "data": "..."}` or `{"type": "exit", "processId": "...", "code": 0}`
- **Routing**: SDK maintains internal event channels (AsyncIterable) per process; consumers iterate via `process.events` and receive routed events

**Session Semantics**: Sessions are long-lived daemon-side entities. Client SSH disconnect does not destroy the session. Processes continue running until explicitly killed or session timeout. Enables agent workflows: spawn task → detach → reconnect later → re-attach and observe/cleanup.

**Key Files**:
- `sdk/index.ts` - Main export and documentation
- `sdk/client.ts` - CapsuleerClient entry point
- `sdk/transport.ts` - RPC transport layer (SSH, JSON-L, request correlation)
- `sdk/session.ts` - Session wrapper (process management, event routing)
- `sdk/process.ts` - Process wrapper (async streams, lifecycle)
- `sdk/types.ts` - Public type definitions
- `sdk/examples.ts` - 10 usage pattern examples

## SDK Implementation Details

**Architecture**: The SDK is organized in layers:

```
CapsuleerClient (entry point)
    ↓
RPCTransport (SSH + JSON-L request/response)
    ↓
Session (process registry + event router)
    ↓
Process (async iterables for stdout/stderr/events)
```

**Key Design Patterns**:

1. **Transport Layer**: `createRPCTransport()` manages the SSH connection, JSON-L serialization, and request/response correlation via numeric IDs. Requests timeout after 30 seconds. Events are broadcast to all listeners.

2. **Session Layer**: `createSession()` wraps an RPC session with process ownership tracking. Routes RPC events to the correct process. Cleans up processes on session kill.

3. **Process Layer**: `createProcess()` implements async iterables for `stdout`, `stderr`, and `events`. Maintains queues of pending data, resolves them as data arrives. The `exited` promise resolves when process exits.

4. **Event Routing**: RPC events from daemon come back unlabeled (no request ID). Session routes by `processId` to the correct process. Process queues events for async iteration.

5. **Async Streams**: Each async iterable is implemented as a generator that pulls from an internal queue, waiting via promise for new data. When process exits, all streams close.

**Error Handling**:
- Connection errors bubble up from `connect()`
- RPC errors are thrown with message: `{CODE}: {message}`
- Process errors are emitted as `ProcessEvent` with type 'error'
- Detach/kill are best-effort (suppress errors if process already dead)
- Stdin throws if process is detached

**Reconnection Pattern** (future):
Sessions are long-lived on daemon side. Could support:
```ts
const sessionId = session.id
await client.disconnect()
// Later...
const client2 = CapsuleerClient(options)
const session2 = await client2.reconnect(sessionId)
const proc = await session2.spawn('shell')  // Works!
```

**Type Safety**:
- `SessionId` and `ProcessId` are branded types to prevent mixing
- All process methods are properly typed
- Events discriminate by `type` field for exhaustive checking
- No untyped `any` in public API