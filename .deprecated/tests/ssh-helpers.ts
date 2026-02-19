/**
 * SSH Test Helpers
 *
 * Utilities for SSH client connections and command execution in tests.
 */

import { Client as SSHClient } from 'ssh2'

/**
 * SSH Connection result with client and channel
 */
export interface SSHConnection {
  client: SSHClient
  channel: any
  connected: boolean
}

/**
 * Connect to SSH server and establish channel
 */
export async function connectSSH(options: {
  host?: string
  port: number
  username?: string
  privateKey?: Buffer
}): Promise<SSHConnection> {
  return new Promise((resolve, reject) => {
    const client = new SSHClient()

    client.on('ready', () => {
      client.shell((err, stream) => {
        if (err) {
          client.end()
          reject(err)
          return
        }

        resolve({
          client,
          channel: stream,
          connected: true
        })
      })
    })

    client.on('error', reject)

    client.connect({
      host: options.host || 'localhost',
      port: options.port,
      username: options.username || 'testuser',
      privateKey: options.privateKey,
      algorithms: {
        serverHostKey: ['ssh-ed25519']
      }
    })
  })
}

/**
 * Send command via SSH and collect output
 */
export async function sendSSHCommand(
  connection: SSHConnection,
  command: string,
  timeoutMs: number = 2000
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    let commandSent = false

    const timeout = setTimeout(() => {
      connection.channel.removeAllListeners('data')
      reject(new Error(`SSH command timeout: ${command}`))
    }, timeoutMs)

    const onData = (data: Buffer) => {
      output += data.toString()

      // Check if command has completed (we see exit response)
      if (output.includes('"type":"exit"') || output.includes('"type":"error"')) {
        clearTimeout(timeout)
        connection.channel.removeListener('data', onData)
        resolve(output)
      }
    }

    connection.channel.on('data', onData)

    // Send command as JSON line
    const cmd = typeof command === 'string' ? JSON.stringify({ command }) : command
    connection.channel.write(cmd + '\n')
    commandSent = true
  })
}

/**
 * Close SSH connection
 */
export async function closeSSH(connection: SSHConnection): Promise<void> {
  return new Promise((resolve) => {
    if (connection.connected) {
      connection.channel.end()
      connection.client.end()
    }
    setTimeout(() => resolve(), 100)
  })
}

/**
 * Execute SSH command via exec channel (for simple commands)
 */
export async function execSSHCommand(options: {
  host?: string
  port: number
  username?: string
  privateKey?: Buffer
  command: string
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const client = new SSHClient()
    let resolved = false

    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        try {
          client.end()
        } catch (e) {}
        reject(new Error(`SSH exec timeout: ${options.command}`))
      }
    }, 5000)

    client.on('ready', () => {
      client.exec(options.command, (err, stream) => {
        if (err) {
          clearTimeout(timeout)
          resolved = true
          client.end()
          reject(err)
          return
        }

        let stdout = ''
        let stderr = ''
        let exitCode = 0

        stream.on('close', (code: number) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            exitCode = code
            client.end()
            resolve({ stdout, stderr, exitCode })
          }
        })

        stream.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
      })
    })

    client.on('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(err)
      }
    })

    client.connect({
      host: options.host || 'localhost',
      port: options.port,
      username: options.username || 'testuser',
      privateKey: options.privateKey,
      algorithms: {
        serverHostKey: ['ssh-ed25519']
      }
    })
  })
}

/**
 * Parse JSON response from SSH command
 */
export function parseSSHResponse(output: string): any {
  const lines = output.split('\n').filter((line) => line.trim().length > 0)
  const jsonLines = lines.filter((line) => line.startsWith('{') || line.startsWith('['))

  if (jsonLines.length === 0) {
    return null
  }

  try {
    return JSON.parse(jsonLines[jsonLines.length - 1])
  } catch (e) {
    return null
  }
}

/**
 * Wait for a specific response type from SSH
 */
export async function waitForSSHResponse(
  connection: SSHConnection,
  expectedType: string,
  timeoutMs: number = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timeout = setTimeout(() => {
      connection.channel.removeAllListeners('data')
      reject(new Error(`Timeout waiting for ${expectedType}`))
    }, timeoutMs)

    const onData = (data: Buffer) => {
      buffer += data.toString()

      // Try to parse each line as JSON
      const lines = buffer.split('\n')
      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const response = JSON.parse(line)
            if (response.type === expectedType) {
              clearTimeout(timeout)
              connection.channel.removeListener('data', onData)
              resolve(response)
              return
            }
          } catch {
            // Not valid JSON yet, continue buffering
          }
        }
      }
    }

    connection.channel.on('data', onData)
  })
}
