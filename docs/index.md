# Capsuleer

Controlled remote execution for AI agents, but without the limitations.

Capsuleer is a **multiplexed remote embodiment runtime** that exposes controlled OS-level execution environments ("Capsules") over SSH while enforcing mediation, session isolation, and capability boundaries.

## For Developers

- **[Mental Models](/guide/mental-models)** — Start here. Understand the core ontology and design principles.
- **[Quick Start](/guide/quick-start)** — Get up and running with a simple example.
- **[Creating Capsules](/guide/creating-capsules)** — Learn how to author and deploy capsules.
- **[SDK Guide](/guide/sdk-overview)** — Integrate capsuleer into your applications.

## Documentation

- **[Core Concepts](/concepts/daemon)** — Deep dive into Daemon, Capsules, Sessions, and Processes.
- **[Developer Guide](/guide/cli-overview)** — CLI commands, blueprint anatomy, capabilities, and mediation.
- **[API Reference](/api/cli)** — Complete API documentation.

## Not Capsuleer

Capsuleer is intentionally NOT:

- A container orchestrator
- A generic SSH wrapper
- A task runner or job scheduler
- A cognitive or planning system
- A deployment or configuration management system

Capsuleer is strictly responsible for **controlled remote execution embodiment**.
