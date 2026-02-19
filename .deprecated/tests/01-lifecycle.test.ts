/**
 * Lifecycle Tests
 *
 * Tests for Capsule state machine: created → booted → shutdown
 */

import { describe, test, expect } from 'bun:test'
import { Capsule, defineCapability, defineOperation } from '../index.ts'

describe('Capsule Lifecycle', () => {
	describe('Initial State', () => {
		test('trigger fails before boot', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							echo: defineOperation({
								name: 'echo',
								handler: async (ctx) => {
									return { echoed: (ctx.params as any).message }
								}
							})
						}
					})
				]
			})

			try {
				await capsule.trigger('test', 'echo', { message: 'hello' })
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('created')
			}
		})

		test('shutdown fails on unbooted capsule', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: []
			})

			try {
				await capsule.shutdown()
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('never booted')
			}
		})
	})

	describe('Boot Transition', () => {
		test('boot enables operation invocation', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							echo: defineOperation({
								name: 'echo',
								handler: async (ctx) => {
									return { echoed: (ctx.params as any).message }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			// After boot, trigger should work
			const result = await capsule.trigger('test', 'echo', { message: 'test' })
			expect(result).toEqual({ echoed: 'test' })

			await capsule.shutdown()
		})

		test('boot is idempotent', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							echo: defineOperation({
								name: 'echo',
								handler: async (ctx) => {
									return { echoed: (ctx.params as any).message }
								}
							})
						}
					})
				]
			})

			await capsule.boot()
			await capsule.boot() // Should not error

			// Should still be functional
			const result = await capsule.trigger('test', 'echo', { message: 'test' })
			expect(result).toEqual({ echoed: 'test' })

			await capsule.shutdown()
		})

		test('cannot boot after shutdown', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: []
			})

			await capsule.boot()
			await capsule.shutdown()

			try {
				await capsule.boot()
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('shutdown')
			}
		})

		test('boot hook is called during boot', async () => {
			let bootHookCalled = false

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [],
				hooks: {
					boot: async () => {
						bootHookCalled = true
					}
				}
			})

			await capsule.boot()
			expect(bootHookCalled).toBe(true)

			await capsule.shutdown()
		})

		test('boot hook can emit stimuli', async () => {
			const stimuli: any[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [],
				hooks: {
					boot: async (ctx) => {
						ctx.capsule.emit({ sense: 'boot:started', data: { time: Date.now() } })
					}
				}
			})

			capsule.onStimulus((s) => stimuli.push(s))
			await capsule.boot()

			expect(stimuli).toHaveLength(1)
			expect(stimuli[0].sense).toBe('boot:started')
			expect(stimuli[0].source).toBeUndefined() // No source in lifecycle hooks
			expect(stimuli[0].data.time).toBeDefined()

			await capsule.shutdown()
		})

		test('boot hook error prevents state transition', async () => {
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
				],
				hooks: {
					boot: async () => {
						throw new Error('Boot failed')
					}
				}
			})

			try {
				await capsule.boot()
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('Boot failed')
			}

			// Should not be in booted state (trigger should fail)
			try {
				await capsule.trigger('test', 'noop', {})
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('created')
			}
		})
	})

	describe('Shutdown Transition', () => {
		test('shutdown prevents operation invocation', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							echo: defineOperation({
								name: 'echo',
								handler: async (ctx) => {
									return { echoed: (ctx.params as any).message }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const result = await capsule.trigger('test', 'echo', { message: 'before' })
			expect(result).toEqual({ echoed: 'before' })

			await capsule.shutdown()

			// trigger should now fail
			try {
				await capsule.trigger('test', 'echo', { message: 'after' })
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('shutdown')
			}
		})

		test('shutdown is idempotent', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: []
			})

			await capsule.boot()
			await capsule.shutdown()
			await capsule.shutdown() // Should not error
		})

		test('shutdown hook is called during shutdown', async () => {
			let shutdownHookCalled = false

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [],
				hooks: {
					shutdown: async () => {
						shutdownHookCalled = true
					}
				}
			})

			await capsule.boot()
			await capsule.shutdown()

			expect(shutdownHookCalled).toBe(true)
		})

		test('shutdown hook can emit stimuli', async () => {
			const stimuli: any[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [],
				hooks: {
					shutdown: async (ctx) => {
						ctx.capsule.emit({ sense: 'shutdown:started', data: { time: Date.now() } })
					}
				}
			})

			capsule.onStimulus((s) => stimuli.push(s))
			await capsule.boot()
			await capsule.shutdown()

			expect(stimuli).toHaveLength(1)
			expect(stimuli[0].sense).toBe('shutdown:started')
			expect(stimuli[0].source).toBeUndefined() // No source in lifecycle hooks
		})

		test('shutdown hook error still completes shutdown', async () => {
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
				],
				hooks: {
					shutdown: async () => {
						throw new Error('Shutdown hook error')
					}
				}
			})

			await capsule.boot()

			try {
				await capsule.shutdown()
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('Shutdown hook error')
			}

			// Should still be shutdown state (trigger should fail)
			try {
				await capsule.trigger('test', 'noop', {})
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('shutdown')
			}
		})
	})

	describe('State Transitions', () => {
		test('complete lifecycle: created → booted → shutdown', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							echo: defineOperation({
								name: 'echo',
								handler: async (ctx) => {
									return { echoed: (ctx.params as any).message }
								}
							})
						}
					})
				]
			})

			// Before boot: operations fail
			try {
				await capsule.trigger('test', 'echo', { message: 'x' })
				expect.unreachable('Should fail before boot')
			} catch {
				// Expected
			}

			// Boot
			await capsule.boot()

			// After boot: operations work
			const result = await capsule.trigger('test', 'echo', { message: 'hello' })
			expect(result).toEqual({ echoed: 'hello' })

			// Shutdown
			await capsule.shutdown()

			// After shutdown: operations fail
			try {
				await capsule.trigger('test', 'echo', { message: 'y' })
				expect.unreachable('Should fail after shutdown')
			} catch {
				// Expected
			}
		})

		test('both lifecycle hooks fire in correct order', async () => {
			const executionOrder: string[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [],
				hooks: {
					boot: async () => {
						executionOrder.push('boot')
					},
					shutdown: async () => {
						executionOrder.push('shutdown')
					}
				}
			})

			await capsule.boot()
			await capsule.shutdown()

			expect(executionOrder).toEqual(['boot', 'shutdown'])
		})
	})

	describe('Metadata', () => {
		test('describe() returns capsule metadata even before boot', () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							echo: defineOperation({
								name: 'echo',
								handler: async (ctx) => {
									return { echoed: (ctx.params as any).message }
								}
							})
						}
					})
				]
			})

			const metadata = capsule.describe()

			expect(metadata.name).toBe('test-capsule')
			expect(metadata.id).toBeDefined()
			expect(metadata.capabilities).toHaveLength(1)
			expect(metadata.capabilities[0].name).toBe('test')
		})

		test('metadata is consistent across lifecycle', async () => {
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

			const metadataBefore = capsule.describe()
			await capsule.boot()
			const metadataAfterBoot = capsule.describe()
			await capsule.shutdown()
			const metadataAfterShutdown = capsule.describe()

			expect(metadataBefore.id).toBe(metadataAfterBoot.id)
			expect(metadataAfterBoot.id).toBe(metadataAfterShutdown.id)
		})
	})
})
