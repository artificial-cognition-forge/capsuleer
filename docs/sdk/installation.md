# Installation

## Install the SDK

```bash
npm install @arcforge/capsuleer-client
```

## Prerequisites

- **Node.js 18+** — Requires async/await, Uint8Array, AbortController
- **SSH server** — Target must have SSH accessible
- **Capsuleer daemon** — Must be running on target host
- **Credentials** — SSH key or password authentication

## Basic Setup

```typescript
import { CapsuleerClient } from '@arcforge/capsuleer-client'

// Set up SSH_AUTH_SOCK if you avoid pain.
process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock'

// This gives us connection to the daemon, not a capsule at this point.
const client = CapsuleerClient({
  host: 'localhost',    // Required: SSH host
  port: 22,             // Required: SSH port (default: 22)
})
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | string | required | SSH host to connect to |
| `port` | number | 22 | SSH port |
| `username` | string | $USER or 'root' | SSH username |
| `privateKeyPath` | string | optional | Path to SSH private key file |
| `timeout` | number | 30000 | RPC request timeout in ms |

## Connection Modes

### Local Development

```typescript
const client = CapsuleerClient({ host: 'localhost' })
```

Assumes SSH is running on localhost with key-based auth.

### Remote Target

```typescript
const client = CapsuleerClient({
  host: 'example.com',
  username: 'deploy',
  privateKeyPath: '/home/user/.ssh/capsuleer_key'
})
```

## Next Steps

- **[Connecting](/sdk/connecting)** — Create a client and connect to a capsule
