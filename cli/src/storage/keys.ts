import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { createHash } from "crypto"

type AuthorizedKey = {
    fingerprint: string
    publicKey: string
    name: string
    addedAt: number
}

function getKeysDir(): string {
    const home = process.env.HOME
    if (!home) throw new Error("HOME environment variable not set")
    return join(home, ".capsuleer", "keys")
}

function getAuthorizedKeysPath(): string {
    return join(getKeysDir(), "authorized_keys.json")
}

function ensureKeysDir(): void {
    const dir = getKeysDir()
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
}

function generateFingerprint(publicKey: string): string {
    return createHash("sha256").update(publicKey).digest("hex").slice(0, 16)
}

function loadAuthorizedKeys(): AuthorizedKey[] {
    ensureKeysDir()
    const path = getAuthorizedKeysPath()
    if (!existsSync(path)) {
        return []
    }
    try {
        const content = readFileSync(path, "utf-8")
        return JSON.parse(content)
    } catch {
        return []
    }
}

function saveAuthorizedKeys(keys: AuthorizedKey[]): void {
    ensureKeysDir()
    const path = getAuthorizedKeysPath()
    writeFileSync(path, JSON.stringify(keys, null, 2))
}

/**
 * Generate SSH authorized_keys format file content for the SSH server
 */
function generateAuthorizedKeysFile(keys: AuthorizedKey[]): string {
    return keys.map((k) => k.publicKey).join("\n")
}

/**
 * Write authorized_keys file to a specific location (for SSH server to read)
 */
export function writeAuthorizedKeysFile(targetPath: string): void {
    const authorizedKeys = loadAuthorizedKeys()
    const content = generateAuthorizedKeysFile(authorizedKeys)
    const dir = targetPath.split("/").slice(0, -1).join("/")
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    writeFileSync(targetPath, content)
}

export const keys = {
    local: {
        /**
         * Add a local public key to authorized keys
         */
        async add(publicKey: string, name?: string): Promise<AuthorizedKey> {
            const fingerprint = generateFingerprint(publicKey)
            const authorizedKeys = loadAuthorizedKeys()

            // Check if key already exists
            const existing = authorizedKeys.find((k) => k.fingerprint === fingerprint)
            if (existing) {
                throw new Error(`Key already registered with fingerprint: ${fingerprint}`)
            }

            const newKey: AuthorizedKey = {
                fingerprint,
                publicKey: publicKey.trim(),
                name: name || `key-${fingerprint}`,
                addedAt: Date.now(),
            }

            authorizedKeys.push(newKey)
            saveAuthorizedKeys(authorizedKeys)

            console.log(`[Auth] Added key '${newKey.name}' (${fingerprint})`)

            return newKey
        },

        /**
         * List all authorized local keys
         */
        async list(): Promise<AuthorizedKey[]> {
            return loadAuthorizedKeys()
        },

        /**
         * Remove a key by fingerprint
         */
        async remove(fingerprint: string): Promise<void> {
            const authorizedKeys = loadAuthorizedKeys()
            const index = authorizedKeys.findIndex((k) => k.fingerprint === fingerprint)

            if (index === -1) {
                throw new Error(`Key not found: ${fingerprint}`)
            }

            const removed = authorizedKeys.splice(index, 1)
            saveAuthorizedKeys(authorizedKeys)

            if (removed[0]) {
                console.log(`[Auth] Removed key '${removed[0].name}' (${fingerprint})`)
            }
        },

        /**
         * Get a key by fingerprint
         */
        async get(fingerprint: string): Promise<AuthorizedKey | null> {
            const authorizedKeys = loadAuthorizedKeys()
            return authorizedKeys.find((k) => k.fingerprint === fingerprint) || null
        },

        /**
         * Verify a public key against stored keys
         * Handles keys with or without comments by comparing normalized versions
         */
        async verify(publicKey: string): Promise<AuthorizedKey | null> {
            const authorizedKeys = loadAuthorizedKeys()

            // Normalize the incoming public key (remove comment if present)
            // Format: "ssh-ed25519 <base64> [comment]"
            const incomingParts = publicKey.trim().split(/\s+/)
            const incomingNormalized = incomingParts.slice(0, 2).join(" ")  // Take only type and key

            // Compare against all stored keys (normalized)
            for (const stored of authorizedKeys) {
                const storedParts = stored.publicKey.trim().split(/\s+/)
                const storedNormalized = storedParts.slice(0, 2).join(" ")  // Take only type and key

                if (incomingNormalized === storedNormalized) {
                    return stored
                }
            }

            return null
        },
    },

    remote: {
        // TODO: For remote capsule keys in future
    },
}