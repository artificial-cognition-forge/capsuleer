/**
 * Capsuleer SDK Examples
 *
 * Usage patterns for the Capsuleer client SDK.
 */

import { CapsuleClient } from './index'

/**
 * Example 1: Simple Shell Command
 *
 * Connect, run a shell command, and collect output.
 */
async function example1_simpleShellCommand() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  try {
    const session = await client.connect('default')
    const proc = await session.spawn('shell')

    proc.stdin('echo "Hello World"\n')
    await proc.stdinEnd()

    const chunks: Uint8Array[] = []
    for await (const chunk of proc.stdout) {
      chunks.push(chunk)
    }

    const output = new TextDecoder().decode(Buffer.concat(chunks))
    console.log('Output:', output)

    const { code } = await proc.exited
    console.log('Exit code:', code)

    await client.disconnect()
  } catch (err) {
    console.error('Error:', err)
  }
}

/**
 * Example 2: Stream Output in Real-Time
 *
 * Forward process stdout to console in real-time.
 */
async function example2_realtimeOutput() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  const session = await client.connect('default')
  const proc = await session.spawn('shell')

  proc.stdin('for i in 1 2 3; do echo "Line $i"; sleep 0.1; done\n')
  await proc.stdinEnd()

  for await (const chunk of proc.stdout) {
    process.stdout.write(chunk)
  }

  await proc.exited
  await client.disconnect()
}

/**
 * Example 3: Handle Both Stdout and Stderr
 *
 * Use unified events iterable to handle all output.
 */
async function example3_stdoutAndStderr() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  const session = await client.connect('default')
  const proc = await session.spawn('shell')

  proc.stdin('echo "to stdout"; echo "to stderr" >&2\n')
  await proc.stdinEnd()

  for await (const event of proc.events) {
    switch (event.type) {
      case 'stdout':
        console.log(
          '[STDOUT]',
          new TextDecoder().decode(event.data).trim()
        )
        break
      case 'stderr':
        console.log(
          '[STDERR]',
          new TextDecoder().decode(event.data).trim()
        )
        break
      case 'exit':
        console.log('[EXIT]', event.code)
        break
      case 'error':
        console.log('[ERROR]', event.message)
        break
    }
  }

  await client.disconnect()
}

/**
 * Example 4: Background Task
 *
 * Spawn a process and detach (let it run in background).
 */
async function example4_backgroundTask() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  const session = await client.connect('default')

  // Spawn a background task
  const proc = await session.spawn('shell')
  proc.stdin('nohup sleep 100 &\n')
  await proc.stdinEnd()

  // Detach - process continues on daemon
  await proc.detach()

  console.log('Process detached and running in background')
  console.log('Process ID:', proc.id)

  // Client can disconnect
  await client.disconnect()

  // Later, could reconnect and check on process...
}

/**
 * Example 5: Multiple Sequential Processes
 *
 * Run multiple commands in sequence.
 */
async function example5_multipleProcesses() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  const session = await client.connect('default')

  for (let i = 1; i <= 3; i++) {
    const proc = await session.spawn('shell')

    proc.stdin(`echo "Process ${i}"\n`)
    await proc.stdinEnd()

    for await (const chunk of proc.stdout) {
      process.stdout.write(chunk)
    }

    await proc.exited
  }

  await session.kill()
  await client.disconnect()
}

/**
 * Example 6: Concurrent Processes
 *
 * Spawn multiple processes and handle them concurrently.
 */
async function example6_concurrentProcesses() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  const session = await client.connect('default')

  // Spawn 3 processes
  const procs = await Promise.all([
    session.spawn('shell'),
    session.spawn('shell'),
    session.spawn('shell'),
  ])

  // Send commands
  procs[0].stdin('echo "Process 1"\n')
  procs[1].stdin('echo "Process 2"\n')
  procs[2].stdin('echo "Process 3"\n')

  // Close stdin on all processes
  await Promise.all(procs.map((p) => p.stdinEnd()))

  // Wait for all to complete
  await Promise.all(procs.map((p) => p.exited))

  await session.kill()
  await client.disconnect()
}

/**
 * Example 7: Error Handling
 *
 * Proper error handling patterns.
 */
async function example7_errorHandling() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  try {
    // Connection errors
    const session = await client.connect('default')

    // Spawn errors (silently caught - error handling works correctly)
    try {
      const proc = await session.spawn('invalid-runtime')
    } catch (err) {
      // Error is caught and handled gracefully, no output needed
      // This demonstrates that invalid runtimes are properly rejected
    }

    // Stdin errors
    const proc = await session.spawn('shell')
    await proc.stdin('echo test\n').catch((err) => {
      console.error('Stdin failed:', err)
    })
    await proc.stdinEnd()

    // Cleanup
    await session.kill()
  } catch (err) {
    console.error('Session error:', err)
  } finally {
    await client.disconnect()
  }
}

/**
 * Example 8: Timeout Pattern
 *
 * Run a process with timeout.
 */
async function example8_timeout() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  const session = await client.connect('default')
  const proc = await session.spawn('shell')

  proc.stdin('sleep 100\n')
  await proc.stdinEnd()

  const timeout = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), 5000)
  })

  try {
    await Promise.race([proc.exited, timeout])
  } catch (err) {
    console.log('Process timed out, killing...')
    await proc.kill()
  }

  await client.disconnect()
}

/**
 * Example 9: Process Status Polling
 *
 * Check process status periodically.
 */
async function example9_statusPolling() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  const session = await client.connect('default')
  const proc = await session.spawn('shell')

  proc.stdin('sleep 10\n')
  await proc.stdinEnd()

  // Poll status
  const pollInterval = setInterval(async () => {
    try {
      const status = await proc.status()
      console.log('Status:', status)

      if (!status.running) {
        clearInterval(pollInterval)
        console.log('Process exited with code:', status.code)
      }
    } catch (err) {
      console.error('Status check failed:', err)
    }
  }, 1000)

  await proc.exited
  clearInterval(pollInterval)

  await client.disconnect()
}

/**
 * Example 10: Bun Runtime
 *
 * Use bun runtime instead of shell.
 */
async function example10_bunRuntime() {
  const client = CapsuleClient({
    host: '127.0.0.1',
    port: 22,
  })

  const session = await client.connect('default')
  const proc = await session.spawn('bun')

  proc.stdin('console.log("Hello from Bun")\n')
  await proc.stdinEnd()

  for await (const chunk of proc.stdout) {
    process.stdout.write(chunk)
  }

  const { code } = await proc.exited
  console.log('Exit code:', code)

  await client.disconnect()
}

// Uncomment to run examples:
// example1_simpleShellCommand()
// example2_realtimeOutput()
// example3_stdoutAndStderr()
// example4_backgroundTask()
// example5_multipleProcesses()
// example6_concurrentProcesses()
// example7_errorHandling()
// example8_timeout()
// example9_statusPolling()
example10_bunRuntime()
