import { Client } from "ssh2"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { cli } from "cli/src/cli"
import { attachCommand } from "cli/src/commands/attach"

/**
 * SSH client for connecting to capsule tmux sessions
 */
type ConnectOptions = {
    capsule: string
    connectionString: string
    host: string
    port: number
    username: string
    privateKeyPath?: string
    mode?: "shell" | "bun"
}

const DEFAULT_PRIVATE_KEYS = [
    "id_ed25519",
    "id_rsa",
    "id_ecdsa",
    "id_dsa",
]

function getSshDir(): string {
    const home = process.env.HOME
    if (!home) throw new Error("HOME environment variable not set")
    return join(home, ".ssh")
}

/**
 * Auto-detect available private keys
 */
function autoDetectPrivateKeys(): string[] {
    const sshDir = getSshDir()
    const keys: string[] = []

    for (const keyName of DEFAULT_PRIVATE_KEYS) {
        const keyPath = join(sshDir, keyName)
        if (existsSync(keyPath)) {
            keys.push(keyPath)
        }
    }

    return keys
}

/**
 * Connect to a remote SSH server and attach to a tmux session
 */
export async function connectToSSH(
    options: ConnectOptions,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const client = new Client()
        const capsuleName = options.capsule

        const command = "tmux a -t capsule-default"

        client.on("ready", async () => {

            const conn = `${options.host}:${options.port}/${options.capsule}`

            client.shell(
                {
                    term: process.env.TERM || "xterm-256color",
                    cols: process.stdout.columns || 80,
                    rows: process.stdout.rows || 24,
                },
                (err, stream) => {
                    if (err) return reject(err)

                    if (process.stdin.isTTY) {
                        process.stdin.setRawMode(true)
                        process.stdin.resume()
                    }

                    process.stdin.on("data", (data) => {
                        stream.write(data)
                    })

                    // process.stdin.on("data", d => console.log("stdin:", d))

                    stream.on("data", (data) => {
                        process.stdout.write(data)
                    })

                    process.on("SIGINT", () => {
                        stream.write("\x03")
                    })

                    stream.on("close", () => {
                        if (process.stdin.isTTY) {
                            process.stdin.setRawMode(false)
                        }
                        client.end()
                        resolve()
                    })
                }
            )
        })

        client.on("error", () => {
            console.log("[SSH Client] Connection error")
            reject()
        })

        // Build connection config
        const config: any = {
            host: options.host,
            port: options.port,
            username: options.username,
        }

        // Determine which private keys to use
        let keyPaths: string[] = []

        if (options.privateKeyPath) {
            // Use explicitly provided key
            keyPaths = [options.privateKeyPath]
        } else {
            // Auto-detect available keys
            keyPaths = autoDetectPrivateKeys()
        }

        // Load private keys
        if (keyPaths.length > 0) {
            const privateKeys: Buffer[] = []
            for (const keyPath of keyPaths) {
                try {
                    privateKeys.push(readFileSync(keyPath))
                    // console.log(`[SSH Client] Loaded private key: ${keyPath}`)
                } catch (error) {
                    console.error(`Failed to read private key from ${keyPath}`)
                }
            }
            if (privateKeys.length > 0) {
                config.privateKey = privateKeys[0]
                if (privateKeys.length > 1) {
                    // console.log(`[SSH Client] Using ${privateKeys.length} private key(s), trying first one`)
                }
            }
        } else if (!options.privateKeyPath) {
            reject(
                new Error(
                    `No private keys found. Generate one with: ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519`
                )
            )
            return
        }

        client.connect(config)
    })
}

/**
 * Connect to a local capsule tmux session via SSH
 */
export async function connectToCapsule(
    options: { port: number; username: string; privateKeyPath: string, capsule: string, connectionString: string }
): Promise<void> {
    const port = options.port || 2423
    const username = options.username || process.env.USER || "root"
    const capsuleName = options.capsule || "default"

    return connectToSSH({
        privateKeyPath: options.privateKeyPath,
        connectionString: "localhost:2423/default",
        capsule: capsuleName,
        host: "127.0.0.1",
        username,
        port,
    })
}