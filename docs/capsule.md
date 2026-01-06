# Capsule

## What a Capsule Represents

A capsule encapsulates **authority** and **sensory access** to a specific domain. It is the security boundary between intelligence and the world. The mind does not talk to the world directly—it talks to the capsule, and the capsule decides what is visible and invokable.

## Authority Encapsulation

Each capsule defines:

- **What operations are exposed**: via declared capabilities
- **What sensory input is available**: via stimulus streams
- **What middleware governs invocations**: via capsule-level and operation-level middleware
- **What lifecycle hooks manage resources**: via `boot()` and `shutdown()`

The mind cannot access anything outside the capsule's declared interface.

## How Capsule(def) Fits Into a Runtime

A capsule is created via `Capsule(def)`, which returns a `CapsuleInstance`. The instance is controlled by a transport layer (e.g., WebSocket server, IPC channel) that:

1. Calls `capsule.boot()` when a connection is established
2. Subscribes to stimuli via `capsule.onStimulus(handler)`
3. Invokes operations via `capsule.trigger(capability, operation, params)`
4. Calls `capsule.shutdown()` when the connection closes

The capsule itself knows nothing about the transport.

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│  Mind (Cognos, LLM, reasoning system)       │
└───────────────────┬─────────────────────────┘
                    │ (transport layer: WebSocket, IPC, etc.)
                    │
┌───────────────────▼─────────────────────────┐
│  Capsule Instance                           │
│  ┌─────────────────────────────────────┐    │
│  │ Middleware (policy enforcement)     │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ Capabilities (namespaced ops)       │    │
│  │   - Operation handlers              │    │
│  │   - emit() for stimuli              │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ Stimulus streams (ambient sensory)  │    │
│  └─────────────────────────────────────┘    │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
              Real world
        (files, processes, devices)
```
