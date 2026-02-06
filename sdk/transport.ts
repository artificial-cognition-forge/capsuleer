/**
 * RPC Transport Layer
 *
 * Handles SSH connection, JSON-L serialization, request correlation, and event routing.
 */

import { Client, type ClientChannel } from 'ssh2'
import readline from 'readline'
import type { ClientOptions, RPCEvent, ProcessId } from './types'

// Trace is optional - only available when SDK runs in CLI context
let trace: any = null
try {
  trace = require('../cli/src/capsuled/trace').trace
} catch {
  // Standalone SDK - no trace available
  trace = () => ({ append: () => { } })
}

interface RPCRequest {
  id: number
  method: string
  params: any
}

interface RPCResponse {
  id: number
  result?: any
  error?: { code: string; message: string }
}

interface RPCMessage {
  type: 'event'
  data: RPCEvent
}

type PendingRequest = {
  resolve: (v: any) => void
  reject: (e: Error) => void
  timeout: NodeJS.Timeout
}

/**
 * RPC Transport interface
 */
export interface RPCTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  request<T>(method: string, params: any): Promise<T>
  onEvent(handler: (event: RPCEvent) => void): void
}

/**
 * Create RPC transport
 */
export function createRPCTransport(options: ClientOptions): RPCTransport {
  let sshClient: Client | null = null
  let rpcStream: ClientChannel | null = null
  let requestId = 0
  const pendingRequests = new Map<number, PendingRequest>()
  const eventHandlers: Array<(event: RPCEvent) => void> = []
  let isConnecting = false

  return {
    async connect() {
      if (isConnecting) {
        throw new Error('Connection already in progress')
      }

      if (sshClient !== null) {
        throw new Error('Already connected')
      }

      isConnecting = true

      return new Promise((resolve, reject) => {
        sshClient = new Client()

        sshClient.on('ready', () => {
          // Exec RPC channel
          sshClient!.exec(
            '~/.capsuleer/scripts/capsuleer.sh rpc stdio',
            (err, stream) => {
              if (err) {
                isConnecting = false
                return reject(err)
              }

              rpcStream = stream

              // Handle stream errors
              stream.on('error', (err) => {
                isConnecting = false
                reject(err)
              })

              // Set up line reader for JSON-L parsing
              const rl = readline.createInterface({
                input: stream,
                crlfDelay: Infinity,
              })

              rl.on('line', (line) => {
                const t = trace()

                try {
                  if (!line.trim()) return

                  // Log line received
                  t.append({
                    type: 'sdk.transport.line.received',
                    lineLength: line.length,
                    isJson: line.trim().startsWith('{'),
                  })

                  let msg: RPCResponse | RPCMessage
                  try {
                    msg = JSON.parse(line) as RPCResponse | RPCMessage
                  } catch (parseErr) {
                    const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)

                    // Log parse error
                    t.append({
                      type: 'sdk.transport.parse.error',
                      error: errMsg,
                      linePreview: line.substring(0, 100),
                    })

                    console.error('[RPC] Parse error:', parseErr)
                    return
                  }

                  if ('type' in msg && msg.type === 'event') {
                    // Broadcast event to all listeners
                    eventHandlers.forEach((h) => h(msg.data))
                  } else if ('id' in msg && typeof msg.id === 'number') {
                    // Response to a request
                    const pending = pendingRequests.get(msg.id)
                    if (pending) {
                      if ('error' in msg && msg.error) {
                        // Log error response
                        t.append({
                          type: 'sdk.rpc.response.error',
                          id: msg.id,
                          method: 'unknown', // We don't have method here, could add if needed
                          code: msg.error.code,
                          message: msg.error.message,
                        })

                        pending.reject(
                          new Error(`${msg.error.code}: ${msg.error.message}`)
                        )
                      } else if ('result' in msg) {
                        pending.resolve(msg.result)
                      }
                    }
                  }
                } catch (e) {
                  console.error('[RPC] Unexpected error:', e)
                }
              })

              rl.on('close', () => {
                // Daemon closed connection
                for (const pending of pendingRequests.values()) {
                  pending.reject(new Error('RPC stream closed'))
                }
                pendingRequests.clear()
                sshClient = null
                rpcStream = null
                isConnecting = false
              })

              isConnecting = false
              resolve()
            }
          )
        })

        sshClient.on('error', (err) => {
          isConnecting = false
          reject(err)
        })

        // Get username
        const username = options.username || process.env.USER || 'root'

        sshClient.connect({
          host: options.host,
          port: options.port,
          username,
          agent: process.env.SSH_AUTH_SOCK,
        })
      })
    },

    async disconnect() {
      if (sshClient) {
        sshClient.end()
        sshClient = null
        rpcStream = null
      }

      // Clear pending requests
      for (const pending of pendingRequests.values()) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Transport disconnected'))
      }
      pendingRequests.clear()
    },

    isConnected() {
      return sshClient !== null && rpcStream !== null
    },

    async request<T>(method: string, params: any): Promise<T> {
      if (!rpcStream) {
        throw new Error('Not connected')
      }

      const id = ++requestId
      const timeout = 30000 // 30 second timeout
      const t = trace()

      // Log request sent
      t.append({
        type: 'sdk.rpc.request.sent',
        id,
        method,
        timeoutMs: timeout,
      })

      const startTime = Date.now()

      return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          pendingRequests.delete(id)

          // Log timeout
          t.append({
            type: 'sdk.rpc.response.timeout',
            id,
            method,
            timeoutMs: timeout,
          })

          reject(new Error(`RPC timeout: ${method}`))
        }, timeout)

        pendingRequests.set(id, {
          resolve: (v: any) => {
            clearTimeout(timeoutHandle)
            const durationMs = Date.now() - startTime

            // Log successful response
            t.append({
              type: 'sdk.rpc.response.received',
              id,
              method,
              durationMs,
            })

            resolve(v)
          },
          reject: (e: Error) => {
            clearTimeout(timeoutHandle)
            reject(e)
          },
          timeout: timeoutHandle,
        })

        const msg: RPCRequest = { id, method, params }

        try {
          rpcStream!.write(JSON.stringify(msg) + '\n')
        } catch (err) {
          clearTimeout(timeoutHandle)
          pendingRequests.delete(id)
          reject(err)
        }
      })
    },

    onEvent(handler: (event: RPCEvent) => void) {
      eventHandlers.push(handler)
    },
  }
}
