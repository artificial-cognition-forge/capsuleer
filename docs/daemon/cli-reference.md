# CLI Reference

The Capsuleer CLI manages daemon lifecycle and provides debugging tools.

## Installation

```bash
npm install -g @capsuleer/cli
```

## Commands

### daemon up

Start daemon in background (non-blocking).

```bash
capsuleer daemon up
```

Spawns detached subprocess. Returns immediately.

### daemon down

Stop daemon.

```bash
capsuleer daemon down
```

Shuts down all capsules, closes SSH connections, exits daemon process.

### daemon runtime

Start daemon in foreground (blocking).

```bash
capsuleer daemon runtime
```

Useful for development. Daemon runs until SIGTERM/SIGINT (Ctrl+C).

Handles graceful shutdown: kills all processes, closes connections, exits.

### daemon health

Check daemon health.

```bash
capsuleer daemon health
```

Returns `{ ok: true }` if daemon is running, otherwise error.

### daemon restart

Restart daemon (convenience command).

```bash
capsuleer daemon restart
```

Equivalent to: `capsuleer daemon down && capsuleer daemon up`

### daemon install

Install systemd/launchd service.

```bash
capsuleer daemon install
```

**Linux**: Creates `~/.config/systemd/user/capsuleer.service`

**macOS**: Creates `~/Library/LaunchAgents/com.capsuleer.daemon.plist`

Allows daemon to auto-start on system boot (user-level).

### daemon uninstall

Remove service files.

```bash
capsuleer daemon uninstall
```

### ls

List running capsules.

```bash
capsuleer ls
```

Prints capsule names and status.

### tail

Stream daemon event log.

```bash
capsuleer tail
```

Displays all daemon events in real-time. Equivalent to: `tail -f <latest-log-file>`

Press Ctrl+C to stop.

**Options:**

- `--follow` or `-f` — Follow log (default behavior)

### rpc stdio

Listen for RPC on stdin/stdout (internal).

```bash
capsuleer rpc stdio
```

**Not for manual use.** Used internally by SSH exec:

```bash
ssh localhost "capsuleer rpc stdio"
```

Reads JSON-L RPC requests from stdin, writes responses/events to stdout.

## Global Options

None currently. All commands accept only positional arguments.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CAPSULEER_HOME` | Base directory for logs, configs (default: `~/.capsuleer`) |
| `CAPSULEER_DEBUG` | Enable debug logging to stderr |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (printed to stderr) |

## Examples

### Development Workflow

```bash
# Start daemon in foreground (for debugging)
capsuleer daemon runtime

# In another terminal:
# Use SDK to connect
node my-script.js

# View events
capsuleer tail

# Stop daemon with Ctrl+C
```

### Production Setup

```bash
# Install systemd service
capsuleer daemon install

# Enable auto-start
systemctl --user enable capsuleer

# Start via systemd
systemctl --user start capsuleer

# Check status
systemctl --user status capsuleer

# View logs
systemctl --user logs capsuleer -f
```

### Debugging

```bash
# Check if daemon is running
capsuleer daemon health

# View all events since last restart
capsuleer tail

# Restart daemon
capsuleer daemon restart

# Stop and check status
capsuleer daemon down
capsuleer daemon health  # Should fail
```

## Next Steps

- **[Daemon Overview](/daemon/overview)** — Architecture and concepts
- **[SDK Installation](/sdk/installation)** — Connect to daemon from code
