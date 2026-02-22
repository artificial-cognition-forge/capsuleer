# Capsuleer

A managed Bun runtime environment for AI agents. Execute TypeScript code and shell commands in a sandboxed, capability-based execution context.

## Overview

Capsuleer provides a transparent, controllable runtime where agents operate within explicitly defined boundaries. Instead of complex Docker containers or unsafe eval patterns, it uses a simple folder-based approach: everything the agent can do is visible as TypeScript in `~/.capsuleer/environment`.

## Installation

```bash
npm install -g @arcforge/capsuleer
```

Requirements: Bun >= 1.0.0

## Quick Start

```bash
# Install the runtime environment
capsuleer install

# Check system health
capsuleer health

# List available capabilities
capsuleer modules

# View logs
capsuleer tail
```

## How It Works

Capsuleer accepts commands via stdin and returns results via stdout. Communication is JSON-based, stateless, and fully observable.

**Send a command:**
```json
{"id":"cmd-1","type":"ts","code":"console.log('Hello')"}
```

**Receive execution events:**
```json
{"id":"cmd-1","type":"start"}
{"id":"cmd-1","type":"stdout","data":"Hello"}
{"id":"cmd-1","type":"exit","ok":true}
```

## Capability System

The runtime exposes capabilities through modules. Each module is a TypeScript file that registers functions globally:

```typescript
// Built-in capabilities
const results = await google.search("typescript patterns")
const files = await fs.find("**/*.ts")
const data = await $fetch("https://api.example.com")
const output = await $`git status`.text()
```

**Included modules:**
- `fs` - Filesystem operations (read, write, find, grep)
- `google` - Web search and content fetching
- `fetch` - HTTP client with auto-parsing
- `bun` - Shell execution and file operations
- `lodash` - Utility functions

## The Environment

Everything lives in `~/.capsuleer/environment`:

```
~/.capsuleer/environment/
├── index.ts              # Entry point
├── build/setup.ts        # Command processor
├── modules/              # Capability modules
│   ├── fs.module.ts
│   ├── fetch.module.ts
│   ├── google.module.ts
│   ├── bun.module.ts
│   └── lodash.module.ts
└── package.json          # Runtime dependencies
```

This is a standalone Bun project. Edit it freely—add dependencies, remove dangerous modules, or extend functionality. Agents can only access what exists here.

## Control & Mediation

Since the environment is plain TypeScript, you have complete control:

- **Remove capabilities** - Delete module files
- **Add safeguards** - Wrap functions in rate limiters or approval workflows
- **Audit operations** - Intercept and log all API calls
- **Customize scope** - Modify modules to restrict access

Every change is transparent and version-controllable.

## Use Cases

- **AI agent runtimes** - Safe execution for LLM-generated code
- **Testing sandboxes** - Isolated environments for untrusted scripts
- **Capability research** - Study what agents actually need
- **Workflow automation** - Scriptable task execution with observability
- **Educational tools** - Controlled programming environments

## Documentation

Full documentation available at [axon.hexlabs.co.uk/docs/capsuleer](https://axon.hexlabs.co.uk/docs/capsuleer)

## License

MIT © Arc Labs
