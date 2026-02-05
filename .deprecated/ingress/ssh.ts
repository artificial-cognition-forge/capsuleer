/**
 * SSH SERVER FOR CAPSULE
 *
 * Exposes shell command execution over SSH.
 * - Listens on configurable port (default 2423)
 * - Authenticates via public key
 * - Routes SSH channels to command execution via Bun.spawn()
 * - Streams command output back over SSH
 *
 * Usage in capsule boot hook:
 *   const sshServer = await createSSHServer({ port: 2423, hostKeyPath: '/path/to/id_ed25519' })
 *   // In shutdown: await sshServer.shutdown()
 */

import { Server as SSHServer, type ClientChannel } from 'ssh2'
import { readFileSync } from 'fs'

/**
 * SSH Server configuration
 */
export interface SSHServerConfig {
  /** Port to listen on (default: 2423) */
  port?: number
  /** Host to bind to (default: 'localhost') */
  host?: string
  /** Path to private key for SSH authentication */
  hostKeyPath: string
  /** Optional authentication handler - return true to accept, false to reject */
  onAuth?: (ctx: {
    username: string
    key?: { algo: string; data: Buffer }
    password?: string
  }) => boolean | Promise<boolean>
  /** Optional log function for debugging */
  log?: (msg: string, data?: unknown) => void
}

/**
 * SSH Server instance returned from createSSHServer()
 */
export interface SSHServerInstance {
  /** Get current server status */
  getStatus(): {
    running: boolean
    port?: number
    connectedClients: number
  }
  /** Gracefully shutdown the server */
  shutdown(): Promise<void>
}

/**
 * Create and start an SSH server
 *
 * @param config - SSH server configuration
 * @returns SSH server instance with status and shutdown methods
 *
 * @example
 * const sshServer = await createSSHServer({
 *   port: 2423,
 *   hostKeyPath: '/home/user/.ssh/id_ed25519'
 * })
 * // ... capsule runs ...
 * await sshServer.shutdown()
 */
export async function createSSHServer(config: SSHServerConfig): Promise<SSHServerInstance> {
  const port = config.port ?? 2423
  const host = config.host ?? 'localhost'
  const log = config.log ?? (() => { })

  let sshServer: SSHServer | null = null
  let clientCount = 0

  try {
    // Load host key
    const hostKey = readFileSync(config.hostKeyPath)

    // Create SSH server
    sshServer = new SSHServer(
      {
        hostKeys: [hostKey]
      },
      (client: any) => {
        clientCount++
        const clientId = Math.random().toString(36).slice(2, 11)

        /**
         * Handle session requests (Bun's ssh2 uses 'session' instead of 'channel')
         */
        const onSession = (accept: any, reject: any) => {
          const channel = accept()

          // Set up handlers on the channel IMMEDIATELY
          // Handle subsystem requests (for things like exec)
          channel.on('subsystem', (name: string, accept: any, reject: any) => {
            accept()
          })

          // Handle shell requests
          channel.on('shell', (accept: any, reject: any) => {
            accept()
          })

          // Handle exec requests (command execution)
          channel.on('exec', async (accept: any, reject: any, command: any) => {
            const cmdStr = typeof command === 'string' ? command : JSON.stringify(command)

            // Accept the exec request and get the stream for this exec session
            const stream = accept()

            // If command is a JSON object with "command" property, parse it
            let cmdToRun: string
            if (typeof command === 'string') {
              cmdToRun = command
            } else if (command && typeof command === 'object' && command.command) {
              cmdToRun = command.command
            } else {
              try {
                stream.stderr?.write?.(`Error: Invalid command format\n`)
              } catch (e) {
                // Stream closed
              }
              stream.end()
              return
            }

            try {
              // Execute through shell to handle proper argument parsing
              const proc = Bun.spawn(['sh', '-c', cmdToRun], {
                cwd: process.cwd(),
                stdin: 'inherit',
                stdout: 'pipe',
                stderr: 'pipe'
              })

              // Wait for process and stream output
              const exitCode = await proc.exited

              // Stream all available output
              if (proc.stdout) {
                const text = await proc.stdout.text()
                if (text) {
                  try {
                    stream.write?.(text)
                  } catch (e) {
                    // Stream closed
                  }
                }
              }

              if (proc.stderr) {
                const text = await proc.stderr.text()
                if (text) {
                  try {
                    stream.stderr?.write?.(text)
                  } catch (e) {
                    // Stream closed
                  }
                }
              }

              // Use exit method if available
              if (typeof stream.exit === 'function') {
                stream.exit(exitCode)
              }
            } catch (error: any) {
              const errMsg = error?.message ?? 'Unknown error'
              try {
                stream.stderr?.write?.(`Error: ${errMsg}\n`)
              } catch (e) {
                // Stream already closed
              }
            } finally {
              // CRITICAL: Always close the stream after exec completes
              try {
                stream.end()
              } catch (e) {
                // Already closed
              }
            }
          })

          // Handle pty requests
          channel.on('pty', (accept: any, reject: any, info: any) => {
            accept()
          })

          // Log any unknown requests
          channel.on('request', (requestType: string, accept: any, reject: any) => {
            accept()
          })

          handleChannel(channel, clientId, log)
        }
        client.on('session', onSession)

        /**
         * Handle authentication
         */
        const onAuth = async (ctx: any) => {
          const authDetails = {
            method: ctx.method,
            username: ctx.username,
            hasSignature: !!ctx.signature,
            hasKey: !!ctx.key,
            keyAlgo: ctx.key?.algo
          }

          try {
            // Default: accept public key auth
            if (ctx.method === 'publickey') {
              if (config.onAuth) {
                const accepted = await config.onAuth({
                  username: ctx.username,
                  key: ctx.key
                })
                if (accepted) {
                  ctx.accept()
                } else {
                  ctx.reject()
                }
              } else {
                // Accept all public key auth by default
                ctx.accept()
              }
            } else if (ctx.method === 'password') {
              if (config.onAuth) {
                const accepted = await config.onAuth({
                  username: ctx.username,
                  password: ctx.password
                })
                if (accepted) {
                  ctx.accept()
                } else {
                  ctx.reject()
                }
              } else {
                // Reject password auth by default
                ctx.reject()
              }
            } else {
              ctx.reject()
            }
          } catch (error) {
            ctx.reject()
          }
        }
        client.on('authentication', onAuth)

        /**
         * Handle client service request
         */
        const onService = (serviceName: string, accept: any, reject: any) => {
          accept()
        }
        client.on('service', onService)

        /**
         * Handle client ready (after initial connection)
         */
        client.on('ready', () => { })

        /**
         * Handle rekey
         */
        client.on('rekey', () => { })

        /**
         * Handle client disconnect
         */
        client.on('end', () => {
          clientCount--
        })

        client.on('error', (error: any) => { })

        client.on('close', () => { })
      }
    )

    // Start listening
    await new Promise<void>((resolve, reject) => {
      sshServer!.listen(port, host, () => {
        resolve()
      })
      sshServer!.on('error', reject)
    })
  } catch (error) {
    throw error
  }

  return {
    getStatus() {
      return {
        running: sshServer !== null,
        port: sshServer ? port : undefined,
        connectedClients: clientCount
      }
    },

    async shutdown() {
      return new Promise<void>((resolve, reject) => {
        if (!sshServer) {
          resolve()
          return
        }

        // Remove any existing close listeners to prevent duplicates
        sshServer.removeAllListeners('close')
        sshServer.removeAllListeners('error')

        let resolved = false

        // Set up timeout to prevent hanging
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            log('SSH server close timeout, forcing shutdown')
            sshServer = null
            resolve()
          }
        }, 5000)

        const closeListener = () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            sshServer = null
            resolve()
          }
        }

        const errorListener = (err: Error) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            sshServer = null
            // Log error but still resolve (shutdown is happening)
            log('SSH server error during close:', err.message)
            resolve()
          }
        }

        sshServer.once('close', closeListener)
        sshServer.once('error', errorListener)

        try {
          sshServer.close()
        } catch (err: any) {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            sshServer = null
            resolve()
          }
        }
      })
    }
  }
}

/**
 * Handle individual SSH channel
 * Routes incoming command JSON to Bun.spawn() and streams output back
 */
async function handleChannel(channel: ClientChannel, clientId: string, log: (msg: string, data?: unknown) => void) {
  let buffer = ''
  let activeProcess: ReturnType<typeof Bun.spawn> | null = null

  /**
   * Handle channel requests (shell, exec, subsystem, etc)
   */
  const onRequest = (requestType: string, accept: any, reject: any) => {

    if (requestType === 'shell') {
      // Accept shell request
      accept()
      channel.write('[Connected to process capsule shell]\n')
      channel.write('Send JSON commands as single lines:\n')
      channel.write('{"command": "echo", "args": ["hello"]}\n')
      channel.write('{"command": "pwd"}\n')
      channel.write('---\n')
    } else if (requestType === 'exec') {
      // Accept exec request (used for direct command execution)
      accept()
    } else if (requestType === 'subsystem') {
      // Accept subsystem (may be used for other protocols)
      accept()
    } else {
      reject()
    }
  }

  channel.on('request', onRequest)

  /**
   * Handle incoming data from SSH client
   */
  channel.on('data', async (chunk: Buffer) => {
    buffer += chunk.toString('utf-8')

    // Process complete lines (JSONL protocol)
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, newlineIndex)
      buffer = buffer.substring(newlineIndex + 1)

      if (line.trim().length === 0) continue

      try {
        const cmd = JSON.parse(line)
        await executeCommand(channel, cmd, clientId, log).catch((error: any) => {
          channel.write(
            JSON.stringify({
              type: 'error',
              error: error?.message ?? 'Unknown error'
            }) + '\n'
          )
        })
      } catch (error: any) {
        channel.write(
          JSON.stringify({
            type: 'error',
            error: `Failed to parse command: ${error?.message}`
          }) + '\n'
        )
      }
    }
  })

  /**
   * Handle channel close
   */
  channel.on('close', () => {
    if (activeProcess) {
      try {
        activeProcess.kill()
      } catch (e) {
        // Already dead
      }
      activeProcess = null
    }
  })

  /**
   * Handle channel signals (Ctrl+C, etc)
   */
  channel.on('signal', (signal: any) => {
    if (activeProcess) {
      try {
        activeProcess.kill()
      } catch (e) {
        // Already dead
      }
      activeProcess = null
    }
  })

  /**
   * Execute command received from SSH client
   */
  async function executeCommand(
    channel: ClientChannel,
    cmd: {
      command: string
      args?: string[]
      cwd?: string
      env?: Record<string, string>
    },
    clientId: string,
    log: (msg: string, data?: unknown) => void
  ): Promise<void> {
    if (!cmd.command) {
      channel.write(JSON.stringify({ type: 'error', error: 'No command specified' }) + '\n')
      return
    }

    try {
      // Kill any existing process
      if (activeProcess) {
        try {
          activeProcess.kill()
        } catch (e) {
          // Already dead
        }
      }

      // Spawn process with Bun
      activeProcess = Bun.spawn([cmd.command, ...(cmd.args || [])], {
        cwd: cmd.cwd || process.cwd(),
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          ...(cmd.env || {})
        }
      })

      // Wait for process to exit first
      const exitCode = await activeProcess.exited

      // Then stream output
      if (activeProcess.stdout) {
        const text = await activeProcess.stdout.text()
        if (text) {
          try {
            channel.write(text)
          } catch (e) {
            // Channel closed
          }
        }
      }

      if (activeProcess.stderr) {
        const text = await activeProcess.stderr.text()
        if (text) {
          try {
            const stderrChannel = (channel as any).stderr
            if (stderrChannel && typeof stderrChannel.write === 'function') {
              stderrChannel.write(text)
            } else {
              channel.write(text)
            }
          } catch (e) {
            // Channel closed
          }
        }
      }

      // Send exit code
      try {
        channel.write(
          JSON.stringify({
            type: 'exit',
            code: exitCode
          }) + '\n'
        )
      } catch (e) {
        // Channel closed, just log it
        log('Channel closed before sending exit code')
      }

      activeProcess = null
    } catch (error: any) {
      try {
        channel.write(
          JSON.stringify({
            type: 'error',
            error: error?.message ?? 'Command execution failed'
          }) + '\n'
        )
      } catch (e) {
        // Channel already closed
      }
    }
  }
}
