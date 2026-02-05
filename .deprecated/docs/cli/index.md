# Installation

```bash
npm install @arclabs/capsuleer
```

# Starting the Capsuleer Daemon

Start the Capsuleer daemon:

```bash
capsuleer daemon start
```

List all capsules:

```bash
capsuleer capsules list
```

Attach to a capsule:

```bash
capsuleer capsules attach <capsule-name>
```

# Connect to a capsule

Connect to a local capsule:

```bash
capsuleer attach <capsule-name/capsule-endpoint>
```

Connect to a remote capsule:

```bash
capsuleer attach <host>:<port>/<capsule-name/capsule-endpoint>
```
