/**
 * SSH TYPES
 *
 * SSH configuration for remote capsule execution.
 */

/**
 * SSH connection configuration
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
