import { Client } from "ssh2"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

/**
 * SSH client for connecting to capsule tmux sessions
 */

type ConnectOptions = {
    host: string
    port: number
    username: string
    privateKeyPath?: string
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
    sessionName: string,
    options: ConnectOptions
): Promise<void> {
    return new Promise((resolve, reject) => {
        const client = new Client()

        client.on("ready", () => {
            console.log(`[SSH Client] Successfully authenticated!`)

            // Request a shell with PTY (pseudo-terminal)
            client.shell(
                {
                    term: "xterm-256color"
                },
                (err: Error | undefined, stream: any) => {
                    if (err) {
                        reject(err)
                        return
                    }

                    // Set up bidirectional piping FIRST for full interactivity
                    stream.pipe(process.stdout)
                    stream.stderr.pipe(process.stderr)
                    process.stdin.pipe(stream)

                    // Send tmux attach command
                    stream.write(`tmux attach-session -t ${sessionName}\n`)

                    stream.on("close", () => {
                        client.end()
                        resolve()
                    })

                    stream.on("error", (err: any) => {
                        client.end()
                        reject(err)
                    })
                }
            )
        })

        client.on("error", (err) => {
            console.error(`[SSH Client] Connection error:`, err.message)
            reject(err)
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
                    console.log(`[SSH Client] Loaded private key: ${keyPath}`)
                } catch (error) {
                    console.error(`Failed to read private key from ${keyPath}`)
                }
            }
            if (privateKeys.length > 0) {
                config.privateKey = privateKeys[0]
                if (privateKeys.length > 1) {
                    console.log(`[SSH Client] Using ${privateKeys.length} private key(s), trying first one`)
                }
                console.log(`[SSH Client] Using private key for authentication`)
            }
        } else if (!options.privateKeyPath) {
            reject(
                new Error(
                    `No private keys found. Generate one with: ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519`
                )
            )
            return
        }

        console.log(`[SSH Client] Connecting to ${options.host}:${options.port} as ${options.username}`)
        console.log(`[SSH Client] Config:`, JSON.stringify({
            host: config.host,
            port: config.port,
            username: config.username,
            privateKey: config.privateKey ? 'present' : 'none',
        }, null, 2))
        client.connect(config)
    })
}

/**
 * Connect to a local capsule tmux session via SSH
 */
export async function connectToCapsule(
    capsuleId: string,
    options: { port?: number; username?: string; privateKeyPath?: string } = {}
): Promise<void> {
    const port = options.port || 2423
    const username = options.username || process.env.USER || "root"

    return connectToSSH(`capsule-${capsuleId}`, {
        host: "127.0.0.1",
        port,
        username,
        privateKeyPath: options.privateKeyPath,
    })
}


const capsuleerClient = {

}