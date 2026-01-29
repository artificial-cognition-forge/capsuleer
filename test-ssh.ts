#!/usr/bin/env bun
/**
 * SSH Test Capsule
 *
 * Run with: bun test-ssh.ts
 * Then SSH in with: ssh -p 2222 user@localhost
 *
 * Send commands like:
 * {"command": "echo", "args": ["Hello World"]}
 * {"command": "ls", "args": ["-la"]}
 * {"command": "pwd"}
 */

import { Capsule, defineCapability, defineOperation } from './index.ts'
import type { CapsuleDef } from './types/mod.js'

// Define a simple "greet" capability
const greetCapability = defineCapability({
  name: 'greet',
  docs: 'Simple greeting operations',
  operations: {
    hello: defineOperation({
      name: 'hello',
      docs: 'Say hello',
      params: {} as Record<never, never>,
      handler: async () => {
        return { message: 'Hello from Capsule!' }
      }
    }),
    echo: defineOperation({
      name: 'echo',
      docs: 'Echo back a message',
      params: { text: { type: 'string' as const } },
      handler: async (ctx) => {
        return { echoed: (ctx.params as any).text }
      }
    })
  }
})

// Define capsule with SSH enabled
const testCapsule: CapsuleDef = {
  name: 'hello-capsule',
  docs: 'Test capsule with SSH shell access',
  capabilities: [greetCapability],
  ssh: {
    port: 2222,
    host: 'localhost',
    hostKeyPath: '/tmp/test_ssh_key',
    log: (msg: string, data?: unknown) => {
      console.log(`[SSH] ${msg}`, data || '')
    }
  }
}

// Boot and run
async function main() {
  console.log('🚀 Starting SSH test capsule...\n')

  const capsule = Capsule({
    def: testCapsule,
    transport: 'local'
  })

  await capsule.boot()
  console.log('✅ Capsule booted successfully!\n')

  const metadata = capsule.describe()
  console.log('📋 Capsule metadata:')
  console.log(`   Name: ${metadata.name}`)
  console.log(`   ID: ${metadata.id}\n`)

  console.log('🔌 SSH Server is running on localhost:2222\n')
  console.log('Try connecting with:')
  console.log('   ssh -p 2222 user@localhost\n')
  console.log('Send commands as JSON lines:')
  console.log('   {"command": "echo", "args": ["Hello from SSH"]}\n')
  console.log('Press Ctrl+C to shutdown...\n')

  // Keep running
  process.on('SIGINT', async () => {
    console.log('\n\n⏹️  Shutting down...')
    await capsule.shutdown()
    console.log('✅ Shutdown complete')
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
