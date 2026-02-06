/**
 * Process Implementation
 *
 * Manages async streams, event routing, and lifecycle.
 */

import type {
  Process,
  ProcessEvent,
  ProcessStatus,
  ProcessId,
  SessionId,
  RPCEvent,
} from './types'
import type { RPCTransport } from './transport'

interface ProcessInternal extends Process {
  _emitEvent(event: RPCEvent): void
}

/**
 * Create process wrapper
 */
export function createProcess(
  id: ProcessId,
  runtime: 'shell' | 'typescript',
  sessionId: SessionId,
  transport: RPCTransport
): ProcessInternal {
  let isDetached = false
  let exitPromiseResolve: ((v: any) => void) | null = null

  // Stdout stream state
  const stdoutQueue: Uint8Array[] = []
  let stdoutDone = false
  let stdoutResolve: (() => void) | null = null

  // Stderr stream state
  const stderrQueue: Uint8Array[] = []
  let stderrDone = false
  let stderrResolve: (() => void) | null = null

  // Events stream state
  const eventQueue: ProcessEvent[] = []
  let eventDone = false
  let eventResolve: (() => void) | null = null

  // Exit promise
  const exitDeferred = new Promise<{ code: number; signal?: string }>(
    (resolve) => {
      exitPromiseResolve = resolve
    }
  )

  function _emitEvent(rpcEvent: RPCEvent) {
    if (isDetached) return // Don't emit after detach

    let event: ProcessEvent | null = null

    switch (rpcEvent.type) {
      case 'stdout': {
        const data = typeof rpcEvent.data === 'string'
          ? new Uint8Array(Buffer.from(rpcEvent.data, 'base64'))
          : rpcEvent.data
        event = { type: 'stdout', data }
        stdoutQueue.push(data)
        if (stdoutResolve) stdoutResolve()
        break
      }

      case 'stderr': {
        const data = typeof rpcEvent.data === 'string'
          ? new Uint8Array(Buffer.from(rpcEvent.data, 'base64'))
          : rpcEvent.data
        event = { type: 'stderr', data }
        stderrQueue.push(data)
        if (stderrResolve) stderrResolve()
        break
      }

      case 'exit':
        event = { type: 'exit', code: rpcEvent.code, signal: rpcEvent.signal }
        stdoutDone = true
        stderrDone = true
        eventDone = true
        if (stdoutResolve) stdoutResolve()
        if (stderrResolve) stderrResolve()
        if (eventResolve) eventResolve()
        if (exitPromiseResolve) {
          exitPromiseResolve({
            code: rpcEvent.code,
            signal: rpcEvent.signal,
          })
        }
        break

      case 'error':
        event = { type: 'error', message: rpcEvent.message }
        stdoutDone = true
        stderrDone = true
        eventDone = true
        if (stdoutResolve) stdoutResolve()
        if (stderrResolve) stderrResolve()
        if (eventResolve) eventResolve()
        break
    }

    // Queue event for .events iterable
    if (event && !eventDone) {
      eventQueue.push(event)
      if (eventResolve) eventResolve()
    }
  }

  const stdout: AsyncIterable<Uint8Array> = {
    async *[Symbol.asyncIterator]() {
      while (!stdoutDone) {
        while (stdoutQueue.length > 0) {
          yield stdoutQueue.shift()!
        }

        if (!stdoutDone) {
          await new Promise<void>((resolve) => {
            stdoutResolve = resolve
          })
        }
      }
    },
  }

  const stderr: AsyncIterable<Uint8Array> = {
    async *[Symbol.asyncIterator]() {
      while (!stderrDone) {
        while (stderrQueue.length > 0) {
          yield stderrQueue.shift()!
        }

        if (!stderrDone) {
          await new Promise<void>((resolve) => {
            stderrResolve = resolve
          })
        }
      }
    },
  }

  const events: AsyncIterable<ProcessEvent> = {
    async *[Symbol.asyncIterator]() {
      while (!eventDone) {
        while (eventQueue.length > 0) {
          yield eventQueue.shift()!
        }

        if (!eventDone) {
          await new Promise<void>((resolve) => {
            eventResolve = resolve
          })
        }
      }
    },
  }

  const process: ProcessInternal = {
    id,
    runtime,
    sessionId,
    startedAt: Date.now(),

    async stdin(data: string | Uint8Array) {
      if (isDetached) throw new Error('Process is detached')

      const encoded =
        typeof data === 'string' ? Buffer.from(data, 'utf-8') : data

      await transport.request('stdin', {
        processId: id,
        data: encoded.toString('base64'),
      })
    },

    async stdinEnd() {
      if (isDetached) throw new Error('Process is detached')

      await transport.request('stdin-end', { processId: id })
    },

    stdout,
    stderr,
    events,

    async kill() {
      if (isDetached) return

      try {
        await transport.request('kill', { processId: id })
      } catch (err) {
        // Process may already be dead, that's ok
      }
    },

    async detach() {
      if (isDetached) return

      isDetached = true

      try {
        await transport.request('detach', { processId: id })
      } catch (err) {
        // Detach is best-effort
      }
    },

    async status() {
      return await transport.request<ProcessStatus>('status', { processId: id })
    },

    exited: exitDeferred,

    _emitEvent,
  }

  return process
}
