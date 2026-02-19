/**
 * SSH TYPES
 *
 * SSH configuration for remote capsule execution and SSH server hosting.
 */

/**
 * SSH client configuration (for connecting TO a remote capsule)
 */
export type SSHConfig = {
    /** SSH host */
    host: string
    /** SSH port (default 22) */
    port?: number
    /** Username */
    username: string
    /** Private key path or password */
    auth: {
        type: "key" | "password"
        path?: string // For key auth
        password?: string // For password auth
    }
    /** Remote path to capsule executable/script */
    capsulePath: string
    /** Working directory on remote (for relative capsulePath) */
    workingDir?: string
    /** Connection timeout in ms (default 5000) */
    connectTimeout?: number
}

/**
 * SSH server configuration (for hosting a capsule via SSH)
 */
export type SSHServerConfig = {
    /** Port to listen on (default: 2423) */
    port?: number
    /** Host to bind to (default: 'localhost') */
    host?: string
    /** Username for SSH connections (default: 'capsule') */
    username?: string
    /** Path to SSH private key for authentication */
    hostKeyPath: string
    /** Optional authentication handler */
    onAuth?: (ctx: {
        username: string
        key?: { algo: string; data: Buffer }
        password?: string
    }) => boolean | Promise<boolean>
}
