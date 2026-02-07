/**
 * Session Implementation
 *
 * Manages process creation, event routing, and session lifecycle.
 */

import type { Session, SessionId, ProcessId, RPCEvent } from './types'
import type { RPCTransport } from './transport'
import { createProcess, type ProcessInternal } from './process'

/**
 * Session interface with internal methods
 */
interface SessionInternal extends Session {
	_onRPCEvent(event: RPCEvent): void
}

/**
 * Create session wrapper
 */
export function createSession(
	id: SessionId,
	capsuleId: string,
	capsuleName: string,
	transport: RPCTransport
): SessionInternal {
	let isKilled = false
	const processes = new Map<ProcessId, ProcessInternal>()

	// Route RPC events to correct process
	function _onRPCEvent(event: RPCEvent) {
		const proc = processes.get(event.processId as ProcessId)
		if (proc) {
			proc._emitEvent(event)
		}
	}

	const session: SessionInternal = {
		id,
		capsuleId,
		capsuleName,
		createdAt: Date.now(),

		async spawn(runtime: 'shell' | 'typescript') {
			if (isKilled) throw new Error('Session is killed')

			const result = await transport.request<{
				processId: string
				runtime: string
			}>('spawn', { runtime })

			const processId = result.processId as ProcessId

			const process = createProcess(processId, runtime, id, transport)

			processes.set(processId, process)

			// Clean up when process exits
			process.exited.then(() => {
				processes.delete(processId)
			})

			return process
		},

		async kill() {
			if (isKilled) return

			isKilled = true

			// Kill all owned processes
			const procs = Array.from(processes.values())
			for (const proc of procs) {
				try {
					await proc.kill()
				} catch (err) {
					// Ignore errors when killing
				}
			}
		},

		isActive() {
			return !isKilled
		},

		_onRPCEvent,
	}

	return session
}
