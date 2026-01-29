/**
 * Test Helpers
 *
 * Utilities for writing Capsule tests.
 */

import { Capsule, defineCapability, defineOperation } from '../index.ts'
import type { CapsuleDef, Stimulus } from '../types/mod.js'

/**
 * Create a minimal test capsule with a simple echo operation
 */
export function createMinimalCapsule() {
  const def: CapsuleDef = {
    name: 'test-capsule',
    docs: 'Minimal test capsule',
    capabilities: [
      defineCapability({
        name: 'test',
        docs: 'Test capability',
        operations: {
          echo: defineOperation({
            name: 'echo',
            docs: 'Echo back input',
            params: { message: { type: 'string' as const } },
            handler: async (ctx) => {
              return { echoed: (ctx.params as any).message }
            }
          })
        }
      })
    ]
  }

  return Capsule(def as any)
}

/**
 * Create a test capsule with lifecycle hooks
 */
export function createCapsuleWithLifecycle(hooks?: {
  boot?: (ctx: { capsule: { emit: any } }) => Promise<void>
  shutdown?: (ctx: { capsule: { emit: any } }) => Promise<void>
}) {
  const def: CapsuleDef = {
    name: 'test-capsule',
    docs: 'Test capsule with lifecycle hooks',
    capabilities: [
      defineCapability({
        name: 'test',
        docs: 'Test capability',
        operations: {
          noop: defineOperation({
            name: 'noop',
            docs: 'No-op operation',
            params: {} as Record<never, never>,
            handler: async () => ({ ok: true })
          })
        }
      })
    ],
    hooks: {
      boot: hooks?.boot,
      shutdown: hooks?.shutdown
    }
  }

  return Capsule(def as any)
}

/**
 * Collect all stimuli emitted by a capsule during a callback
 */
export async function collectStimuli(
  capsule: ReturnType<typeof Capsule>,
  callback: () => Promise<void>
): Promise<Stimulus[]> {
  const stimuli: Stimulus[] = []
  const unsubscribe = capsule.onStimulus((s) => stimuli.push(s))

  try {
    await callback()
  } finally {
    unsubscribe()
  }

  return stimuli
}

/**
 * Wait for a stimulus with a specific sense
 */
export async function waitForStimulus(
  capsule: ReturnType<typeof Capsule>,
  sense: string,
  timeoutMs: number = 1000
): Promise<Stimulus> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error(`Timeout waiting for stimulus: ${sense}`))
    }, timeoutMs)

    const unsubscribe = capsule.onStimulus((s) => {
      if (s.sense === sense) {
        clearTimeout(timeout)
        unsubscribe()
        resolve(s)
      }
    })
  })
}
