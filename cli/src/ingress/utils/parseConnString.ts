/**
 * Parse SSH connection string to capsule
 * Format: [user@]host:port/capsule-name
 *
 * Examples:
 *   - localhost:2424/default
 *   - user@localhost:2424/default
 *   - 127.0.0.1:2424/capsule1
 *   - root@192.168.1.1:2424/myapp
 */

export type ParsedConnString = {
    user: string
    host: string
    port: number
    capsuleName: string
}

export function parseConnString(connString: string): ParsedConnString {
    if (!connString || typeof connString !== 'string') {
        throw new Error("Connection string must be a non-empty string")
    }

    if (!connString.includes("/")) {
        throw new Error(
            `Invalid connection string: missing capsule name\n` +
            `Format: [user@]host:port/capsule-name\n` +
            `Example: localhost:2424/default`
        )
    }

    const [hostPart, capsuleName] = connString.split("/", 2)

    if (!capsuleName || capsuleName.trim().length === 0) {
        throw new Error(
            `Invalid connection string: capsule name cannot be empty\n` +
            `Format: [user@]host:port/capsule-name`
        )
    }

    if (!hostPart || hostPart.trim().length === 0) {
        throw new Error(
            `Invalid connection string: host:port cannot be empty\n` +
            `Format: [user@]host:port/capsule-name`
        )
    }

    // Parse user@host:port
    // Pattern: optional user@, then host (any chars except @), then :port
    const userMatch = hostPart.match(/^(?:([^@]+)@)?(.+):(\d+)$/)
    if (!userMatch) {
        throw new Error(
            `Invalid host:port format\n` +
            `Expected: [user@]host:port\n` +
            `Got: ${hostPart}`
        )
    }

    const [, userPart, host, portStr] = userMatch
    const user = userPart || (process.env.USER || "root")
    const port = parseInt(portStr, 10)

    if (isNaN(port)) {
        throw new Error(`Invalid port: '${portStr}' is not a number`)
    }

    if (port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${port} (must be between 1 and 65535)`)
    }

    return {
        user: user.trim(),
        host: host.trim(),
        port,
        capsuleName: capsuleName.trim(),
    }
}
