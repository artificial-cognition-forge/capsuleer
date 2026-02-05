# Stimuli

## What Stimuli Are

Stimuli are ambient sensory events emitted by the capsule. They represent background signals from the environment: terminal output, file system changes, logs, sensor data. Stimuli are unstructured and asynchronous.

## How They Differ from Operation Return Values

- **Return values**: Synchronous responses to explicit invocations. Scoped to a single request.
- **Stimuli**: Asynchronous ambient signals. Not tied to any specific invocation.

Use return values for "what did this operation produce?" Use stimuli for "what is the environment doing?"

## Why They Are One-Directional

Stimuli flow **capsule → server only**. The mind observes stimuli but cannot push data into the capsule via stimulus channels. This prevents ambiguity about where information originates.

## Provenance and Timestamps

The runtime automatically adds:

- `timestamp`: When the stimulus was emitted
- `source.capability`: Which capability emitted it (if from an operation handler)
- `source.operation`: Which operation emitted it (if from an operation handler)

This metadata aids debugging and auditing.

## Optional Typing via StimulusMap

By default, stimuli are untyped (`sense: string, data: unknown`). You can constrain `emit()` by defining a `StimulusMap`:

```typescript
type TmuxStimuli = {
  "tmux:output": { sessionId: string; data: string }
  "tmux:session:created": { id: string; name: string }
}

const capsuleDef = {
  name: "local-tmux",
  capabilities: [tmux],
  hooks: {
    async boot({ capsule }: LifecycleContext<TmuxStimuli>) {
      capsule.emit({
        sense: "tmux:output", // type-checked!
        data: { sessionId: "123", data: "hello" }
      })
    }
  }
}
```
