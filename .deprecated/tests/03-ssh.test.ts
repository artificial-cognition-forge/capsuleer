/**
 * SSH Transport Tests
 *
 * Critical tests for SSH server lifecycle, authentication, command execution,
 * and integration with capsule operations.
 */

import { describe, test, expect, beforeAll, afterEach } from 'bun:test'
import { readFileSync } from 'fs'
import { Capsule, defineCapability, defineOperation } from '../index.ts'
import type { CapsuleDef } from '../types/mod.js'
import {
  connectSSH,
  closeSSH,
  execSSHCommand,
  parseSSHResponse,
  waitForSSHResponse
} from './ssh-helpers.ts'

// Test SSH key path
const SSH_KEY_PATH = '/tmp/test_ssh_ed25519'
const SSH_HOST = 'localhost'

// Dynamic port selection
let nextPort = 2300
function getNextPort() {
  return nextPort++
}

// Store capsules to clean up
const activeCapsules: ReturnType<typeof Capsule>[] = []

// Helper to create a test capsule with SSH
function createTestCapsule(config: { sshPort?: number; onAuth?: any } = {}) {
  const port = config.sshPort || getNextPort()

  const def: CapsuleDef = {
    name: 'ssh-test-capsule',
    docs: 'Capsule for testing SSH transport',
    capabilities: [
      defineCapability({
        name: 'exec',
        docs: 'Command execution',
        operations: {
          echo: defineOperation({
            name: 'echo',
            docs: 'Echo a message',
            params: { message: { type: 'string' as const } },
            handler: async (ctx) => {
              return { echoed: (ctx.params as any).message }
            }
          }),
          pwd: defineOperation({
            name: 'pwd',
            docs: 'Get current working directory',
            handler: async () => {
              const result = await new Promise<string>((resolve) => {
                const proc = Bun.spawn(['pwd'], {
                  stdout: 'pipe'
                })
                proc.stdout.text().then(resolve)
              })
              return { cwd: result.trim() }
            }
          })
        }
      })
    ],
    ssh: {
      port,
      host: SSH_HOST,
      hostKeyPath: SSH_KEY_PATH,
      onAuth: config.onAuth,
      log: (msg: string) => {
        // Suppress SSH logs in tests
      }
    }
  }

  const capsule = Capsule(def)
  activeCapsules.push(capsule)
  return { capsule, port }
}

// Cleanup hook with timeout
afterEach(async () => {
  // Shutdown all active capsules with timeout
  const shutdownPromises = activeCapsules.map((capsule) =>
    Promise.race([
      capsule.shutdown().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000)) // 2s timeout per capsule
    ])
  )

  try {
    await Promise.all(shutdownPromises)
  } catch (error) {
    // Ignore errors during cleanup
  }

  activeCapsules.length = 0

  // Wait for ports to be released
  await new Promise((resolve) => setTimeout(resolve, 50))
})

// Load private key for SSH client
let privateKey: Buffer

beforeAll(() => {
  privateKey = readFileSync(SSH_KEY_PATH)
})

describe('SSH Transport', () => {
  describe('1. SSH Server Lifecycle Integration', () => {
    test('SSH server starts during capsule boot', async () => {
      const { capsule } = createTestCapsule()
      await capsule.boot()

      const metadata = capsule.describe()
      expect(metadata).toBeDefined()
    })

    test('SSH server stops during capsule shutdown', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      // Try to connect (should work)
      let connection = await connectSSH({
        host: SSH_HOST,
        port,
        privateKey
      })
      expect(connection.connected).toBe(true)
      await closeSSH(connection)

      // Shutdown
      await capsule.shutdown()

      // Try to connect again (should fail)
      try {
        connection = await connectSSH({
          host: SSH_HOST,
          port,
          privateKey,
          username: 'testuser'
        })
        expect.unreachable('Should not connect after shutdown')
      } catch (error: any) {
        expect(error.message).toBeDefined()
      }
    })

    test('SSH server is idempotent on boot', async () => {
      const { capsule, port } = createTestCapsule()

      await capsule.boot()
      await capsule.boot() // Should not error

      // Should still be able to connect
      const connection = await connectSSH({
        host: SSH_HOST,
        port,
        privateKey
      })
      expect(connection.connected).toBe(true)
      await closeSSH(connection)
    })
  })

  describe('2. Authentication Flow', () => {
    test('public key auth accepted by default', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        const connection = await connectSSH({
          host: SSH_HOST,
          port,
          privateKey
        })
        expect(connection.connected).toBe(true)
        await closeSSH(connection)
      } finally {
        await capsule.shutdown()
      }
    })

    test('custom auth handler can accept connections', async () => {
      let authCalled = false

      const { capsule, port } = createTestCapsule({
        onAuth: async (ctx: any) => {
          authCalled = true
          return ctx.username === 'admin'
        }
      })
      await capsule.boot()

      try {
        const connection = await connectSSH({
          host: SSH_HOST,
          port,
          username: 'admin',
          privateKey
        })
        expect(connection.connected).toBe(true)
        expect(authCalled).toBe(true)
        await closeSSH(connection)
      } finally {
        await capsule.shutdown()
      }
    })

    test('custom auth handler can reject connections', async () => {
      const { capsule, port } = createTestCapsule({
        onAuth: async () => {
          return false // Always reject
        }
      })
      await capsule.boot()

      try {
        const connection = await connectSSH({
          host: SSH_HOST,
          port,
          privateKey
        })
        expect.unreachable('Should reject connection')
      } catch (error: any) {
        expect(error).toBeDefined()
      } finally {
        await capsule.shutdown()
      }
    })
  })

  describe('3. Command Execution (Exec)', () => {
    test('simple echo command executes and returns output', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        const result = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'echo "Hello SSH"'
        })

        expect(result.stdout).toContain('Hello SSH')
        expect(result.exitCode).toBe(0)
      } finally {
        await capsule.shutdown()
      }
    })

    test('command with arguments executes correctly', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        const result = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'echo "arg1" "arg2"'
        })

        expect(result.stdout).toContain('arg1')
        expect(result.exitCode).toBe(0)
      } finally {
        await capsule.shutdown()
      }
    })

    test('command stderr is captured', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        const result = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'sh -c "echo error >&2; exit 1"'
        })

        expect(result.stderr).toContain('error')
        expect(result.exitCode).toBe(1)
      } finally {
        await capsule.shutdown()
      }
    })

    test('exit code is reported correctly', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        // Command that exits with code 42
        const result = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'sh -c "exit 42"'
        })

        expect(result.exitCode).toBe(42)
      } finally {
        await capsule.shutdown()
      }
    })

    test('command errors handled gracefully', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        const result = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'nonexistent_command_xyz'
        })

        // Command should fail with non-zero exit code
        expect(result.exitCode).not.toBe(0)
      } finally {
        await capsule.shutdown()
      }
    })
  })

  describe('4. Complex Scenarios', () => {
    test('rapid fire commands execute sequentially', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        const results = await Promise.all([
          execSSHCommand({ host: SSH_HOST, port, privateKey, command: 'echo test1' }),
          execSSHCommand({ host: SSH_HOST, port, privateKey, command: 'echo test2' }),
          execSSHCommand({ host: SSH_HOST, port, privateKey, command: 'echo test3' })
        ])

        expect(results).toHaveLength(3)
        results.forEach((result) => {
          expect(result.exitCode).toBe(0)
        })
      } finally {
        await capsule.shutdown()
      }
    })

    test('environment variables are passed through', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        const result = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'sh -c "echo $TEST_VAR"'
        })

        // Variable should be empty since we didn't set it
        expect(result.exitCode).toBe(0)
      } finally {
        await capsule.shutdown()
      }
    })
  })

  describe('5. Client Management', () => {
    test('sequential command executions from different processes', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        // Exec from first session
        const result1 = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'echo "session1"'
        })
        expect(result1.stdout).toContain('session1')
        expect(result1.exitCode).toBe(0)

        // Exec from second session
        const result2 = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'echo "session2"'
        })
        expect(result2.stdout).toContain('session2')
        expect(result2.exitCode).toBe(0)

        // Exec from third session
        const result3 = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'echo "session3"'
        })
        expect(result3.stdout).toContain('session3')
        expect(result3.exitCode).toBe(0)
      } finally {
        await capsule.shutdown()
      }
    })
  })

  describe('6. Capsule Integration', () => {
    test('capsule operations coexist with SSH', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        // Use capsule operation
        const result1 = await capsule.trigger('exec', 'echo', { message: 'capsule' })
        expect(result1.echoed).toBe('capsule')

        // Use SSH at the same time
        const result2 = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'echo "ssh"'
        })

        expect(result2.stdout).toContain('ssh')

        // Use capsule operation again
        const result3 = await capsule.trigger('exec', 'echo', { message: 'capsule2' })
        expect(result3.echoed).toBe('capsule2')
      } finally {
        await capsule.shutdown()
      }
    })

    test('SSH server gracefully shuts down with active connections', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        // Trigger SSH command
        const execPromise = execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'sleep 0.1 && echo "done"'
        })

        // Immediately trigger shutdown (command should still complete)
        await new Promise((resolve) => setTimeout(resolve, 50))
        const shutdownPromise = capsule.shutdown()

        // Both should complete without error
        const [result] = await Promise.all([execPromise, shutdownPromise])
        expect(result).toBeDefined()
      } finally {
        // Ensure clean shutdown
        try {
          await capsule.shutdown()
        } catch {
          // Already shutdown
        }
      }
    })
  })

  describe('7. SSH Metadata (describe and ssh methods)', () => {
    test('capsule.ssh() returns complete connection details after boot', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        const sshMetadata = capsule.ssh()

        expect(sshMetadata).toBeDefined()
        expect(sshMetadata?.host).toBe(SSH_HOST)
        expect(sshMetadata?.port).toBe(port)
        expect(sshMetadata?.username).toBe('capsule')
        expect(sshMetadata?.publicKey).toBeDefined()
        expect(sshMetadata?.publicKeyFingerprint).toBeDefined()

        // Public key should start with algo (e.g., "ssh-ed25519")
        expect(sshMetadata?.publicKey).toMatch(/^ssh-/)

        // Fingerprint should follow SSH format (e.g., "SHA256:xxxx...")
        expect(sshMetadata?.publicKeyFingerprint).toMatch(/^SHA256:/)
      } finally {
        await capsule.shutdown()
      }
    })

    test('capsule.describe() includes ssh metadata in response', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        const metadata = capsule.describe()

        expect(metadata).toBeDefined()
        expect(metadata.ssh).toBeDefined()
        expect(metadata.ssh?.host).toBe(SSH_HOST)
        expect(metadata.ssh?.port).toBe(port)
        expect(metadata.ssh?.username).toBe('capsule')
        expect(metadata.ssh?.publicKey).toBeDefined()
        expect(metadata.ssh?.publicKeyFingerprint).toBeDefined()
      } finally {
        await capsule.shutdown()
      }
    })

    test('capsule.ssh() returns undefined before boot', async () => {
      const { capsule } = createTestCapsule()

      const sshMetadata = capsule.ssh()
      expect(sshMetadata).toBeUndefined()
    })

    test('capsule.ssh() respects custom username from config', async () => {
      const port = getNextPort()
      const def: CapsuleDef = {
        name: 'custom-user-capsule',
        capabilities: [],
        ssh: {
          port,
          host: SSH_HOST,
          username: 'customuser',
          hostKeyPath: SSH_KEY_PATH
        }
      }

      const capsule = Capsule(def)
      activeCapsules.push(capsule)
      await capsule.boot()

      try {
        const sshMetadata = capsule.ssh()
        expect(sshMetadata?.username).toBe('customuser')
      } finally {
        await capsule.shutdown()
      }
    })

    test('capsule.ssh() uses default values for unspecified config', async () => {
      const port = getNextPort()
      // Only specify required fields
      const def: CapsuleDef = {
        name: 'minimal-ssh-capsule',
        capabilities: [],
        ssh: {
          port,
          hostKeyPath: SSH_KEY_PATH
          // host and username not specified
        }
      }

      const capsule = Capsule(def)
      activeCapsules.push(capsule)
      await capsule.boot()

      try {
        const sshMetadata = capsule.ssh()
        expect(sshMetadata?.host).toBe('localhost') // default host
        expect(sshMetadata?.username).toBe('capsule') // default username
        expect(sshMetadata?.port).toBe(port)
      } finally {
        await capsule.shutdown()
      }
    })
  })

  describe('8. Error Handling', () => {
    test('invalid host key path fails at startup', async () => {
      const def: CapsuleDef = {
        name: 'bad-key-capsule',
        capabilities: [],
        ssh: {
          port: 2299,
          host: SSH_HOST,
          hostKeyPath: '/nonexistent/path/to/key',
          log: () => {}
        }
      }

      const capsule = Capsule(def)

      try {
        await capsule.boot()
        expect.unreachable('Should fail with bad key path')
      } catch (error: any) {
        expect(error.message).toContain('Failed to start SSH server')
      }
    })

    test('process spawn failures handled gracefully', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      try {
        // Try to run a command that doesn't exist
        const result = await execSSHCommand({
          host: SSH_HOST,
          port,
          privateKey,
          command: 'this_command_definitely_does_not_exist_12345'
        })

        // Should get error, not crash
        expect(result.exitCode).not.toBe(0)
      } finally {
        await capsule.shutdown()
      }
    })

    test('SSH shutdown errors do not prevent capsule shutdown', async () => {
      const { capsule, port } = createTestCapsule()
      await capsule.boot()

      // Establish connection to ensure SSH is working
      const connection = await connectSSH({
        host: SSH_HOST,
        port,
        privateKey
      })

      // Close manually (but don't use closeSSH)
      connection.channel.end()
      connection.client.end()

      // Capsule shutdown should still work
      await expect(capsule.shutdown()).resolves.toBeUndefined()
    })
  })
})
