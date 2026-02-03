import { readFileSync } from "fs"
import { join } from "path"
import { keys } from "../storage/keys"

const DEFAULT_SSH_KEYS = [
    "id_rsa.pub",
    "id_ed25519.pub",
    "id_ecdsa.pub",
    "id_dsa.pub",
]

function getSshDir(): string {
    const home = process.env.HOME
    if (!home) throw new Error("HOME environment variable not set")
    return join(home, ".ssh")
}

function expandPath(path: string): string {
    return path.replace("~", process.env.HOME || "")
}

/**
 * Verify a public key against authorized keys (for SSH server)
 * @param publicKeyStr - SSH wire format public key string (e.g., "ssh-ed25519 AAAA...")
 * @returns Authorized key metadata if valid, null if unauthorized
 */
export async function verifyPublicKey(publicKeyStr: string) {
    try {
        return await keys.local.verify(publicKeyStr)
    } catch (error) {
        console.error(`[Auth] Verification error:`, error)
        return null
    }
}

export const auth = {
    /**
     * Add a public key to authorized keys
     *
     * @param keyPathOrContent - Path to public key file (e.g., ~/.ssh/id_rsa.pub) or raw key content
     * @param name - Optional name for the key
     */
    async add(keyPathOrContent: string, name?: string) {
        try {
            let publicKey: string

            // Check if it's a file path or raw key content
            if (keyPathOrContent.startsWith("/") || keyPathOrContent.startsWith("~")) {
                const expandedPath = expandPath(keyPathOrContent)
                try {
                    publicKey = readFileSync(expandedPath, "utf-8")
                } catch {
                    // If file read fails, treat as raw content
                    publicKey = keyPathOrContent
                }
            } else {
                publicKey = keyPathOrContent
            }

            const addedKey = await keys.local.add(publicKey, name)
            console.log(`✓ Key registered: ${addedKey.name}`)
            console.log(`  Fingerprint: ${addedKey.fingerprint}`)
        } catch (error) {
            console.error(`✗ Failed to add key:`, error)
            throw error
        }
    },

    /**
     * Automatically setup SSH keys by scanning ~/.ssh and adding available keys
     */
    async setup() {
        try {
            const sshDir = getSshDir()
            const existingKeys = await keys.local.list()

            console.log("[Auth] Setting up SSH keys...")

            let added = 0
            let skipped = 0

            // Try to add each default key type
            for (const keyFile of DEFAULT_SSH_KEYS) {
                const keyPath = join(sshDir, keyFile)
                try {
                    const publicKey = readFileSync(keyPath, "utf-8")

                    // Check if key already exists
                    const existing = existingKeys.find(k => k.publicKey === publicKey.trim())
                    if (existing) {
                        console.log(`  ⊘ ${keyFile} (already registered)`)
                        skipped++
                        continue
                    }

                    const keyName = keyFile.replace(".pub", "")
                    const addedKey = await keys.local.add(publicKey, keyName)
                    console.log(`  ✓ ${keyFile} (${addedKey.fingerprint})`)
                    added++
                } catch {
                    // Key file doesn't exist, skip silently
                }
            }

            if (added === 0 && skipped === 0) {
                console.log("\n✗ No SSH keys found in ~/.ssh")
                console.log("  Generate a key with: ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519")
                return
            }

            if (added > 0) {
                console.log(`\n✓ Setup complete: added ${added} key(s)`)
            } else {
                console.log(`\n⊘ No new keys to add (${skipped} already registered)`)
            }
        } catch (error) {
            console.error(`✗ Failed to setup keys:`, error)
            throw error
        }
    },

    /**
     * List all authorized keys
     */
    async list() {
        try {
            const keyList = await keys.local.list()

            if (keyList.length === 0) {
                console.log("No keys registered. Add one with: capsuleer auth add <key-path>")
                return
            }

            console.log(`Registered Keys (${keyList.length}):`)
            for (const key of keyList) {
                const date = new Date(key.addedAt).toLocaleDateString()
                console.log(`  ${key.fingerprint}  ${key.name} (${date})`)
            }
        } catch (error) {
            console.error(`✗ Failed to list keys:`, error)
            throw error
        }
    },

    /**
     * Remove an authorized key by fingerprint
     */
    async remove(fingerprint: string) {
        try {
            await keys.local.remove(fingerprint)
            console.log(`✓ Key removed`)
        } catch (error) {
            console.error(`✗ Failed to remove key:`, error)
            throw error
        }
    },
}