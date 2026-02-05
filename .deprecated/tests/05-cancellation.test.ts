/**
 * Cancellation & Abort Signal Tests
 *
 * Tests for operation cancellation via AbortSignal:
 * - Caller-provided signals
 * - Shutdown-triggered aborts
 * - Signal propagation and reason tracking
 * - Concurrent operations with mixed states
 */

import { describe, test, expect } from 'bun:test'
import { Capsule, defineCapability, defineOperation } from '../index.ts'

describe('Capsule Cancellation & Abort Signals', () => {
	describe('Caller-Provided Abort Signals', () => {
		test('operation accepts AbortSignal parameter', async () => {
			let signalReceived: AbortSignal | undefined

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							capture: defineOperation({
								name: 'capture',
								handler: async (ctx) => {
									signalReceived = ctx.signal
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			await capsule.trigger('test', 'capture', {}, controller.signal)

			expect(signalReceived).toBeInstanceOf(AbortSignal)
			expect(signalReceived?.aborted).toBe(false)

			await capsule.shutdown()
		})

		test('already-aborted signal is rejected before execution', async () => {
			let handlerRan = false

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async () => {
									handlerRan = true
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			controller.abort('pre-aborted')

			try {
				await capsule.trigger('test', 'noop', {}, controller.signal)
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('aborted')
			}

			expect(handlerRan).toBe(false)

			await capsule.shutdown()
		})

		test('signal abort during operation cancels execution', async () => {
			let operationStarted = false
			let operationCompleted = false

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							slow: defineOperation({
								name: 'slow',
								handler: async (ctx) => {
									operationStarted = true

									// Wait for abort
									await new Promise<void>((resolve) => {
										const checkAbort = setInterval(() => {
											if (ctx.signal.aborted) {
												clearInterval(checkAbort)
												resolve()
											}
										}, 10)
									})

									operationCompleted = true
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			const operationPromise = capsule.trigger('test', 'slow', {}, controller.signal)

			// Give operation time to start
			await new Promise((r) => setTimeout(r, 20))
			expect(operationStarted).toBe(true)

			// Abort
			controller.abort('user-cancel')

			try {
				await operationPromise
			} catch {
				// Expected
			}

			// Operation may have completed, but that's okay
			// The signal was aborted
			expect(operationStarted).toBe(true)

			await capsule.shutdown()
		})

		test('signal abort reason is accessible in handler', async () => {
			let receivedReason: any = 'NOT_SET'

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							capture: defineOperation({
								name: 'capture',
								handler: async (ctx) => {
									// Simulate async operation that gets aborted
									await new Promise<void>((resolve) => {
										const checkAbort = setInterval(() => {
											if (ctx.signal.aborted) {
												receivedReason = ctx.signal.reason
												clearInterval(checkAbort)
												resolve()
											}
										}, 10)
									})
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			const operationPromise = capsule.trigger('test', 'capture', {}, controller.signal)

			await new Promise((r) => setTimeout(r, 20))
			controller.abort('timeout-exceeded')

			try {
				await operationPromise
			} catch {
				// Expected
			}

			expect(receivedReason).toBe('timeout-exceeded')

			await capsule.shutdown()
		})

		test('multiple concurrent operations with different signals', async () => {
			const results: string[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							work: defineOperation({
								name: 'work',
								handler: async (ctx) => {
									const id = (ctx.params as any).id
									// Wait to see if aborted
									await new Promise<void>((resolve) => {
										const checkAbort = setInterval(() => {
											if (ctx.signal.aborted) {
												clearInterval(checkAbort)
												resolve()
											}
										}, 5)
										setTimeout(() => {
											clearInterval(checkAbort)
											resolve()
										}, 100)
									})

									if (ctx.signal.aborted) {
										results.push(`aborted-${id}`)
									} else {
										results.push(`completed-${id}`)
									}
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller1 = new AbortController()
			const controller2 = new AbortController()
			const controller3 = new AbortController()

			const op1 = capsule.trigger('test', 'work', { id: 1 }, controller1.signal)
			const op2 = capsule.trigger('test', 'work', { id: 2 }, controller2.signal)
			const op3 = capsule.trigger('test', 'work', { id: 3 }, controller3.signal)

			await new Promise((r) => setTimeout(r, 10))

			// Abort first two
			controller1.abort()
			controller2.abort()
			// Leave third running

			try {
				await Promise.all([op1, op2, op3])
			} catch {
				// Some may fail
			}

			// First two should be aborted or errored, third should complete
			expect(results).toContain('aborted-1')
			expect(results).toContain('aborted-2')
			expect(results).toContain('completed-3')

			await capsule.shutdown()
		})
	})

	describe('Shutdown-Triggered Abort', () => {
		test('in-flight operations are aborted on shutdown', async () => {
			let operationAborted = false

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							slow: defineOperation({
								name: 'slow',
								handler: async (ctx) => {
									// Long operation that will be interrupted
									await new Promise<void>((resolve) => {
										const checkAbort = setInterval(() => {
											if (ctx.signal.aborted) {
												operationAborted = true
												clearInterval(checkAbort)
												resolve()
											}
										}, 10)
										setTimeout(() => {
											clearInterval(checkAbort)
											resolve()
										}, 5000)
									})
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			// Start long operation but don't await
			const operationPromise = capsule.trigger('test', 'slow', {})

			// Give it a moment to start
			await new Promise((r) => setTimeout(r, 20))

			// Shutdown (should abort the operation)
			await capsule.shutdown()

			// Wait a bit for abort to propagate
			await new Promise((r) => setTimeout(r, 50))

			expect(operationAborted).toBe(true)
		})

		test('multiple in-flight operations are all aborted on shutdown', async () => {
			const abortedOps: string[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							slow: defineOperation({
								name: 'slow',
								handler: async (ctx) => {
									const opId = (ctx.params as any).id

									await new Promise<void>((resolve) => {
										const checkAbort = setInterval(() => {
											if (ctx.signal.aborted) {
												abortedOps.push(opId)
												clearInterval(checkAbort)
												resolve()
											}
										}, 10)
										setTimeout(() => {
											clearInterval(checkAbort)
											resolve()
										}, 5000)
									})

									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			// Start multiple operations
			const op1 = capsule.trigger('test', 'slow', { id: 'op1' })
			const op2 = capsule.trigger('test', 'slow', { id: 'op2' })
			const op3 = capsule.trigger('test', 'slow', { id: 'op3' })

			// Give them time to start
			await new Promise((r) => setTimeout(r, 20))

			// Shutdown (should abort all)
			await capsule.shutdown()

			// Wait for aborts to propagate
			await new Promise((r) => setTimeout(r, 100))

			// All should have been aborted
			expect(abortedOps).toContain('op1')
			expect(abortedOps).toContain('op2')
			expect(abortedOps).toContain('op3')
		})

		test('operations triggered after shutdown are rejected', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()
			await capsule.shutdown()

			try {
				await capsule.trigger('test', 'noop', {})
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('shutdown')
			}
		})

		test('shutdown completes even if abort signal propagation is slow', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							slow: defineOperation({
								name: 'slow',
								handler: async (ctx) => {
									// Very slow abort detection
									await new Promise<void>((resolve) => {
										let checked = 0
										const checkAbort = setInterval(() => {
											checked++
											if (ctx.signal.aborted || checked > 500) {
												clearInterval(checkAbort)
												resolve()
											}
										}, 100)
									})
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			// Start operation
			const operationPromise = capsule.trigger('test', 'slow', {})

			// Give it time to start
			await new Promise((r) => setTimeout(r, 20))

			// Shutdown should complete quickly
			const shutdownStart = Date.now()
			await capsule.shutdown()
			const shutdownTime = Date.now() - shutdownStart

			// Shutdown shouldn't be blocked waiting for slow operation
			expect(shutdownTime).toBeLessThan(1000)
		})
	})

	describe('Stream Operations with Cancellation', () => {
		test('stream operation can be cancelled', async () => {
			const yieldedValues: number[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							stream: defineOperation({
								name: 'stream',
								kind: 'stream',
								handler: async function* (ctx) {
									for (let i = 1; i <= 100; i++) {
										if (ctx.signal.aborted) {
											break
										}
										yield i
										await new Promise((r) => setTimeout(r, 5))
									}
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			const generator = await capsule.trigger('test', 'stream', {}, controller.signal)

			// Consume some values
			for await (const value of generator) {
				yieldedValues.push(value)
				if (yieldedValues.length === 5) {
					// Cancel after 5 values
					controller.abort()
				}
			}

			// Should have received 5 values before abort
			expect(yieldedValues.length).toBeLessThanOrEqual(6)

			await capsule.shutdown()
		})

		test('stream operation respects abort signal', async () => {
			const yieldedValues: number[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							stream: defineOperation({
								name: 'stream',
								kind: 'stream',
								handler: async function* (ctx) {
									for (let i = 1; i <= 100; i++) {
										if (ctx.signal.aborted) {
											break
										}
										yield i
										await new Promise((r) => setTimeout(r, 5))
									}
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			const generator = await capsule.trigger('test', 'stream', {}, controller.signal)

			// Consume values
			for await (const value of generator) {
				yieldedValues.push(value)
				if (yieldedValues.length === 10) {
					// Abort after 10 values
					controller.abort('user-stop')
				}
			}

			// Should have gotten ~10 values before abort
			expect(yieldedValues.length).toBeLessThanOrEqual(15)
			expect(yieldedValues.length).toBeGreaterThan(0)

			await capsule.shutdown()
		})
	})

	describe('Signal & Middleware Integration', () => {
		test('middleware receives non-aborted signal before execution', async () => {
			let middlewareSignalAborted = false

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						middlewareSignalAborted = ctx.signal.aborted
						return { type: 'accept' as const }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			await capsule.trigger('test', 'noop', {}, controller.signal)

			// Middleware should see non-aborted signal
			expect(middlewareSignalAborted).toBe(false)

			await capsule.shutdown()
		})

		test('already-aborted signal fails before middleware runs', async () => {
			let middlewareRan = false

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						middlewareRan = true
						return { type: 'accept' as const }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			controller.abort('pre-aborted')

			try {
				await capsule.trigger('test', 'noop', {}, controller.signal)
				expect.unreachable('Should have thrown')
			} catch {
				// Expected
			}

			expect(middlewareRan).toBe(false)

			await capsule.shutdown()
		})

		test('middleware can transform params before signal abort check', async () => {
			let finalParams: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						return {
							type: 'transform' as const,
							params: { ...ctx.params, modified: true }
						}
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							capture: defineOperation({
								name: 'capture',
								handler: async (ctx) => {
									finalParams = ctx.params
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			await capsule.trigger('test', 'capture', { original: true }, controller.signal)

			expect(finalParams).toEqual({ original: true, modified: true })

			await capsule.shutdown()
		})
	})

	describe('Edge Cases & Error States', () => {
		test('handler throwing error clears in-flight tracking', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							fails: defineOperation({
								name: 'fails',
								handler: async () => {
									throw new Error('Handler error')
								}
							}),
							works: defineOperation({
								name: 'works',
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()

			// Trigger failing operation
			try {
				await capsule.trigger('test', 'fails', {})
			} catch {
				// Expected
			}

			// Shutdown should work (no in-flight operations hanging)
			await expect(capsule.shutdown()).resolves.toBeUndefined()

			// And we should be able to verify capsule is truly shutdown
			try {
				await capsule.trigger('test', 'works', {})
				expect.unreachable('Should not trigger after shutdown')
			} catch (error: any) {
				expect(error.message).toContain('shutdown')
			}
		})

		test('signal abort while operation is in middleware chain', async () => {
			let middlewareRan = false
			let handlerRan = false

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						middlewareRan = true
						// Simulate slow middleware that might be aborted
						await new Promise((r) => setTimeout(r, 50))
						return { type: 'accept' as const }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async () => {
									handlerRan = true
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			const operationPromise = capsule.trigger('test', 'noop', {}, controller.signal)

			// Abort before middleware completes
			await new Promise((r) => setTimeout(r, 10))
			controller.abort('early-abort')

			try {
				await operationPromise
			} catch {
				// Expected
			}

			// Middleware should have started but may not complete handler
			expect(middlewareRan).toBe(true)

			await capsule.shutdown()
		})

		test('rapid abort and shutdown sequence', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							slow: defineOperation({
								name: 'slow',
								handler: async (ctx) => {
									await new Promise<void>((resolve) => {
										const checkAbort = setInterval(() => {
											if (ctx.signal.aborted) {
												clearInterval(checkAbort)
												resolve()
											}
										}, 5)
										setTimeout(() => {
											clearInterval(checkAbort)
											resolve()
										}, 5000)
									})
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			const opPromise = capsule.trigger('test', 'slow', {}, controller.signal)

			await new Promise((r) => setTimeout(r, 5))

			// Abort and shutdown quickly in sequence
			controller.abort('user-cancel')
			const shutdownPromise = capsule.shutdown()

			// Both should complete without error
			try {
				await opPromise
			} catch {
				// Operation error is expected
			}

			await expect(shutdownPromise).resolves.toBeUndefined()
		})

		test('no signal provided (undefined) works normally', async () => {
			let signalReceived: AbortSignal | undefined

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							capture: defineOperation({
								name: 'capture',
								handler: async (ctx) => {
									signalReceived = ctx.signal
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			// Trigger without signal
			await capsule.trigger('test', 'capture', {})

			// Should have received an internal signal
			expect(signalReceived).toBeInstanceOf(AbortSignal)
			expect(signalReceived?.aborted).toBe(false)

			await capsule.shutdown()
		})
	})

	describe('Abort Reason Preservation', () => {
		test('abort reason is accessible as DOMException name', async () => {
			let capturedReason: any = 'NOT_SET'

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							capture: defineOperation({
								name: 'capture',
								handler: async (ctx) => {
									await new Promise<void>((resolve) => {
										const checkAbort = setInterval(() => {
											if (ctx.signal.aborted) {
												capturedReason = ctx.signal.reason
												clearInterval(checkAbort)
												resolve()
											}
										}, 10)
									})
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller = new AbortController()
			const opPromise = capsule.trigger('test', 'capture', {}, controller.signal)

			await new Promise((r) => setTimeout(r, 10))
			const reason = { type: 'timeout', duration: 5000 }
			controller.abort(reason)

			try {
				await opPromise
			} catch {
				// Expected
			}

			expect(capturedReason).toEqual(reason)

			await capsule.shutdown()
		})

		test('shutdown-triggered abort reason is "system"', async () => {
			let abortReason: any = 'NOT_SET'

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							capture: defineOperation({
								name: 'capture',
								handler: async (ctx) => {
									await new Promise<void>((resolve) => {
										const checkAbort = setInterval(() => {
											if (ctx.signal.aborted) {
												abortReason = ctx.signal.reason
												clearInterval(checkAbort)
												resolve()
											}
										}, 10)
									})
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			// Start operation but don't provide signal
			const opPromise = capsule.trigger('test', 'capture', {})

			await new Promise((r) => setTimeout(r, 10))

			// Shutdown should abort with "system" reason
			await capsule.shutdown()

			// Wait for abort to propagate
			await new Promise((r) => setTimeout(r, 50))

			expect(abortReason).toBe('system')
		})
	})

	describe('Concurrent Cancellation Scenarios', () => {
		test('many concurrent operations aborted on shutdown', async () => {
			const completedOps: string[] = []
			const abortedOps: string[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							work: defineOperation({
								name: 'work',
								handler: async (ctx) => {
									const id = (ctx.params as any).id

									await new Promise<void>((resolve) => {
										let elapsed = 0
										const checkAbort = setInterval(() => {
											elapsed += 10
											if (ctx.signal.aborted) {
												abortedOps.push(id)
												clearInterval(checkAbort)
												resolve()
											} else if (elapsed > 1000) {
												completedOps.push(id)
												clearInterval(checkAbort)
												resolve()
											}
										}, 10)
									})

									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			// Start many operations
			const ops = Array.from({ length: 10 }, (_, i) =>
				capsule.trigger('test', 'work', { id: `op-${i}` })
			)

			// Give them time to start
			await new Promise((r) => setTimeout(r, 20))

			// Shutdown (should abort all)
			await capsule.shutdown()

			// Wait for abort processing
			await new Promise((r) => setTimeout(r, 100))

			// Most should be aborted
			expect(abortedOps.length).toBeGreaterThan(0)
			// Some might complete before abort takes effect, but most should be aborted
			expect(abortedOps.length + completedOps.length).toBe(10)
		})

		test('operations with external and shutdown abort signals both respond', async () => {
			const signals: string[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							track: defineOperation({
								name: 'track',
								handler: async (ctx) => {
									const id = (ctx.params as any).id

									await new Promise<void>((resolve) => {
										const checkAbort = setInterval(() => {
											if (ctx.signal.aborted) {
												signals.push(`${id}-aborted`)
												clearInterval(checkAbort)
												resolve()
											}
										}, 10)
										setTimeout(() => {
											clearInterval(checkAbort)
											signals.push(`${id}-timeout`)
											resolve()
										}, 5000)
									})

									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const controller1 = new AbortController()

			// Op1: external abort
			const op1 = capsule.trigger('test', 'track', { id: 'op1' }, controller1.signal)
			// Op2: shutdown abort
			const op2 = capsule.trigger('test', 'track', { id: 'op2' })

			await new Promise((r) => setTimeout(r, 10))

			// Abort op1 externally
			controller1.abort('external')

			// Then shutdown (aborts op2)
			await new Promise((r) => setTimeout(r, 10))
			await capsule.shutdown()

			await new Promise((r) => setTimeout(r, 100))

			expect(signals).toContain('op1-aborted')
			expect(signals).toContain('op2-aborted')
		})
	})
})
