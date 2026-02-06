/**
 * Capsuleer Client
 *
 * Main entry point for SDK usage. Handles SSH connection and session management.
 */

import type { CapsuleerClient, CapsuleerClientT, ClientOptions, SessionId } from './types'
import { createRPCTransport, type RPCTransport } from './transport'
import { createSession, type SessionInternal } from './session'

// Import trace - note: this is a dynamic import since SDK may run in different contexts
let getTrace: (() => any) | null = null
const initTrace = () => {
  if (!getTrace) {
    try {
      // Try to import trace if available (when SDK is used from CLI context)
      const traceModule = require('../cli/src/capsuled/trace')
      getTrace = traceModule.trace
    } catch {
      // Trace not available (SDK used standalone)
      getTrace = () => ({ append: () => { } })
    }
  }
  return getTrace()
}

/**
 * Create Capsule client
 *
 * Entry point for all SDK usage. Handles SSH connection setup but does NOT connect immediately.
 *
 * @param options Client connection options (host, port, username)
 * @returns Client instance
 *
 * @example
 * const client = CapsuleerClient({
 *   host: '127.0.0.1',
 *   port: 22,
 *   username: 'user'
 * })
 *
 * const session = await client.connect('default')
 * const proc = await session.spawn('shell')
 * proc.stdin('echo "Hello"\n')
 * for await (const chunk of proc.stdout) {
 *   console.log(new TextDecoder().decode(chunk))
 * }
 */
export function CapsuleerClient(options: ClientOptions): CapsuleerClientT {
  const transport = createRPCTransport(options)
  let currentSession: SessionInternal | null = null

  return {
    async connect(capsuleId: string) {
      const t = initTrace()
      const connectStartTime = Date.now()

      try {
        t.append({ type: 'sdk.client.connect.initiated', capsuleId })

        // Connect transport if not already connected
        if (!transport.isConnected()) {
          const transportStartTime = Date.now()
          await transport.connect()
          const transportDuration = Date.now() - transportStartTime
          t.append({ type: 'sdk.client.connect.transport.success', durationMs: transportDuration })
        }

        // Request session attachment
        const result = await transport.request<{
          sessionId: string
          capsuleId: string
          createdAt: number
        }>('attach-capsule', { capsuleId })

        const sessionId = result.sessionId as SessionId

        // Create session wrapper
        currentSession = createSession(
          sessionId,
          result.capsuleId,
          result.capsuleId,
          transport
        )

        const connectDuration = Date.now() - connectStartTime
        t.append({
          type: 'sdk.client.connect.session.success',
          capsuleId: result.capsuleId,
          sessionId,
          durationMs: connectDuration
        })

        t.append({
          type: 'sdk.client.session.attached',
          capsuleId: result.capsuleId,
          sessionId
        })

        // Subscribe to RPC events
        transport.onEvent((event) => {
          if (currentSession) {
            currentSession._onRPCEvent(event)
          }
        })

        return currentSession
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        t.append({
          type: 'sdk.client.connect.error',
          capsuleId,
          error
        })
        throw err
      }
    },

    async isConnected() {
      return transport.isConnected()
    },

    async disconnect() {
      const t = initTrace()

      try {
        t.append({ type: 'sdk.client.disconnect.initiated' })

        if (currentSession) {
          try {
            await currentSession.kill()
            t.append({ type: 'sdk.client.disconnect.session.kill' })
            t.append({ type: 'sdk.client.session.killed', sessionId: currentSession.id })
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            t.append({
              type: 'sdk.client.disconnect.error',
              error
            })
            // Ignore errors during cleanup
          }
        }

        transport.disconnect()
        t.append({ type: 'sdk.client.disconnect.transport.close' })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        t.append({
          type: 'sdk.client.disconnect.error',
          error
        })
      }
    },
  }
}
