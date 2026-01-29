/**
 * Middleware Tests
 *
 * Tests for operation middleware: execution order, transformation,
 * rejection, error handling, and signal propagation
 */

import { describe, test, expect } from 'bun:test'
import { Capsule, defineCapability, defineOperation } from '../index.ts'

describe('Capsule Middleware', () => {
	describe('Basic Middleware Execution', () => {
		test('single capsule-level middleware executes', async () => {
			let middlewareRan = false

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
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
			await capsule.trigger('test', 'noop', {})
			expect(middlewareRan).toBe(true)
			await capsule.shutdown()
		})

		test('single operation-level middleware executes', async () => {
			let middlewareRan = false

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								middleware: [
									async (ctx) => {
										middlewareRan = true
										return { type: 'accept' as const }
									}
								],
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()
			await capsule.trigger('test', 'noop', {})
			expect(middlewareRan).toBe(true)
			await capsule.shutdown()
		})

		test('capsule-level middleware executes before operation-level', async () => {
			const executionOrder: string[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						executionOrder.push('capsule')
						return { type: 'accept' as const }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								middleware: [
									async () => {
										executionOrder.push('operation')
										return { type: 'accept' as const }
									}
								],
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()
			await capsule.trigger('test', 'noop', {})
			expect(executionOrder).toEqual(['capsule', 'operation'])
			await capsule.shutdown()
		})

		test('multiple capsule-level middleware execute in order', async () => {
			const executionOrder: string[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						executionOrder.push('first')
						return { type: 'accept' as const }
					},
					async () => {
						executionOrder.push('second')
						return { type: 'accept' as const }
					},
					async () => {
						executionOrder.push('third')
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
			await capsule.trigger('test', 'noop', {})
			expect(executionOrder).toEqual(['first', 'second', 'third'])
			await capsule.shutdown()
		})

		test('middleware receives correct invocation context', async () => {
			let receivedCtx: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						receivedCtx = ctx
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
			await capsule.trigger('test', 'noop', { key: 'value' })

			expect(receivedCtx.capability).toBe('test')
			expect(receivedCtx.operation).toBe('noop')
			expect(receivedCtx.params).toEqual({ key: 'value' })
			expect(receivedCtx.signal).toBeInstanceOf(AbortSignal)

			await capsule.shutdown()
		})
	})

	describe('Middleware Results: Reject', () => {
		test('reject result stops execution and throws', async () => {
			let operationRan = false

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						return { type: 'reject' as const, reason: 'Not allowed' }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async () => {
									operationRan = true
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			try {
				await capsule.trigger('test', 'noop', {})
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('Not allowed')
			}

			expect(operationRan).toBe(false)
			await capsule.shutdown()
		})

		test('reject stops chain before operation-level middleware', async () => {
			let opMiddlewareRan = false

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						return { type: 'reject' as const, reason: 'Rejected' }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								middleware: [
									async () => {
										opMiddlewareRan = true
										return { type: 'accept' as const }
									}
								],
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()

			try {
				await capsule.trigger('test', 'noop', {})
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('Rejected')
			}

			expect(opMiddlewareRan).toBe(false)
			await capsule.shutdown()
		})

		test('reject reason is included in error message', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						return { type: 'reject' as const, reason: 'Custom rejection reason' }
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

			try {
				await capsule.trigger('test', 'noop', {})
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('Custom rejection reason')
			}

			await capsule.shutdown()
		})
	})

	describe('Middleware Results: Transform', () => {
		test('transform result modifies params for next middleware', async () => {
			let secondMiddlewareParams: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						return {
							type: 'transform' as const,
							params: { ...ctx.params, modified: true }
						}
					},
					async (ctx) => {
						secondMiddlewareParams = ctx.params
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
			await capsule.trigger('test', 'noop', { original: true })

			expect(secondMiddlewareParams).toEqual({ original: true, modified: true })
			await capsule.shutdown()
		})

		test('transform modifies params for operation handler', async () => {
			let operationParams: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						return {
							type: 'transform' as const,
							params: { ...ctx.params, added: 'value' }
						}
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async (ctx) => {
									operationParams = ctx.params
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()
			await capsule.trigger('test', 'noop', { original: 'value' })

			expect(operationParams).toEqual({ original: 'value', added: 'value' })
			await capsule.shutdown()
		})

		test('multiple transforms accumulate', async () => {
			let operationParams: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						return {
							type: 'transform' as const,
							params: { ...ctx.params, first: 1 }
						}
					},
					async (ctx) => {
						return {
							type: 'transform' as const,
							params: { ...ctx.params, second: 2 }
						}
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								middleware: [
									async (ctx) => {
										return {
											type: 'transform' as const,
											params: { ...ctx.params, third: 3 }
										}
									}
								],
								handler: async (ctx) => {
									operationParams = ctx.params
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()
			await capsule.trigger('test', 'noop', { original: 0 })

			expect(operationParams).toEqual({ original: 0, first: 1, second: 2, third: 3 })
			await capsule.shutdown()
		})

		test('transform to empty object is valid', async () => {
			let operationParams: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						return { type: 'transform' as const, params: {} }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async (ctx) => {
									operationParams = ctx.params
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()
			await capsule.trigger('test', 'noop', { original: 'value' })

			expect(operationParams).toEqual({})
			await capsule.shutdown()
		})
	})

	describe('Middleware Results: Accept', () => {
		test('accept result continues without changes', async () => {
			let operationParams: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						return { type: 'accept' as const }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async (ctx) => {
									operationParams = ctx.params
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()
			await capsule.trigger('test', 'noop', { original: 'value' })

			expect(operationParams).toEqual({ original: 'value' })
			await capsule.shutdown()
		})

		test('multiple accepts pass through unchanged', async () => {
			let operationParams: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						return { type: 'accept' as const }
					},
					async () => {
						return { type: 'accept' as const }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async (ctx) => {
									operationParams = ctx.params
									return { ok: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()
			await capsule.trigger('test', 'noop', { a: 1, b: 2 })

			expect(operationParams).toEqual({ a: 1, b: 2 })
			await capsule.shutdown()
		})
	})

	describe('Error Handling in Middleware', () => {
		test('middleware throwing error propagates to caller', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						throw new Error('Middleware error')
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

			try {
				await capsule.trigger('test', 'noop', {})
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('Middleware error')
			}

			await capsule.shutdown()
		})

		test('capsule-level middleware error stops operation-level middleware', async () => {
			let opMiddlewareRan = false

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						throw new Error('Capsule middleware failed')
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								middleware: [
									async () => {
										opMiddlewareRan = true
										return { type: 'accept' as const }
									}
								],
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()

			try {
				await capsule.trigger('test', 'noop', {})
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('Capsule middleware failed')
			}

			expect(opMiddlewareRan).toBe(false)
			await capsule.shutdown()
		})

		test('operation-level middleware error propagates', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								middleware: [
									async () => {
										throw new Error('Operation middleware failed')
									}
								],
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()

			try {
				await capsule.trigger('test', 'noop', {})
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('Operation middleware failed')
			}

			await capsule.shutdown()
		})

		test('middleware error in one operation does not affect next operation', async () => {
			const results = []

			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							fails: defineOperation({
								name: 'fails',
								middleware: [
									async () => {
										throw new Error('This operation fails')
									}
								],
								handler: async () => ({ ok: true })
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

			// First operation fails
			try {
				await capsule.trigger('test', 'fails', {})
				expect.unreachable('Should have thrown')
			} catch {
				results.push('failed')
			}

			// Second operation should work
			const result = await capsule.trigger('test', 'works', {})
			results.push('worked')

			expect(results).toEqual(['failed', 'worked'])
			expect(result.ok).toBe(true)

			await capsule.shutdown()
		})

		test('shutdown still works after middleware error', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						throw new Error('Middleware error')
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

			try {
				await capsule.trigger('test', 'noop', {})
			} catch {
				// Expected
			}

			// Shutdown should work despite previous error
			await expect(capsule.shutdown()).resolves.toBeUndefined()
		})
	})

	describe('Signal Propagation in Middleware', () => {
		test('middleware receives AbortSignal in context', async () => {
			let receivedSignal: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						receivedSignal = ctx.signal
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
			await capsule.trigger('test', 'noop', {})

			expect(receivedSignal).toBeInstanceOf(AbortSignal)
			expect(receivedSignal.aborted).toBe(false)

			await capsule.shutdown()
		})

		test('already-aborted signal is rejected before middleware', async () => {
			const controller = new AbortController()
			controller.abort('test-reason')

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async () => {
						// Should never be called
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

			try {
				await capsule.trigger('test', 'noop', {}, controller.signal)
				expect.unreachable('Should have thrown')
			} catch (error: any) {
				expect(error.message).toContain('aborted')
			}

			await capsule.shutdown()
		})

		test('signal reason is preserved through middleware', async () => {
			let receivedReason: any

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						receivedReason = ctx.signal.reason
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
			const promise = capsule.trigger('test', 'noop', {}, controller.signal)

			// Give middleware time to run
			await new Promise((r) => setTimeout(r, 10))
			controller.abort('custom-reason')

			try {
				await promise
			} catch {
				// Expected
			}

			// Middleware should have seen undefined reason (signal wasn't aborted when middleware ran)
			expect(receivedReason).toBeUndefined()

			await capsule.shutdown()
		})

		test('middleware can check if signal is aborted', async () => {
			let signalWasAborted = false

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						signalWasAborted = ctx.signal.aborted
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
			await capsule.trigger('test', 'noop', {})

			expect(signalWasAborted).toBe(false)

			await capsule.shutdown()
		})
	})

	describe('Edge Cases', () => {
		test('no middleware (empty chain)', async () => {
			const capsule = Capsule({
				name: 'test-capsule',
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							noop: defineOperation({
								name: 'noop',
								handler: async (ctx) => {
									return { params: ctx.params }
								}
							})
						}
					})
				]
			})

			await capsule.boot()
			const result = await capsule.trigger('test', 'noop', { test: 'value' })

			expect(result.params).toEqual({ test: 'value' })

			await capsule.shutdown()
		})

		test('middleware with no params', async () => {
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
			await capsule.trigger('test', 'noop', {})

			expect(middlewareRan).toBe(true)

			await capsule.shutdown()
		})

		test('middleware can reject for logging/auditing', async () => {
			const auditLog: string[] = []

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [
					async (ctx) => {
						// Simulate audit check
						if ((ctx.params as any).admin !== true) {
							auditLog.push('rejected-unauthorized')
							return { type: 'reject' as const, reason: 'Unauthorized' }
						}
						auditLog.push('authorized')
						return { type: 'accept' as const }
					}
				],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							restricted: defineOperation({
								name: 'restricted',
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()

			// Unauthorized attempt
			try {
				await capsule.trigger('test', 'restricted', { admin: false })
			} catch {
				// Expected
			}

			expect(auditLog).toContain('rejected-unauthorized')

			// Authorized attempt
			await capsule.trigger('test', 'restricted', { admin: true })

			expect(auditLog).toContain('authorized')

			await capsule.shutdown()
		})

		test('same middleware in both capsule and operation level works', async () => {
			const executionLog: string[] = []

			const loggingMiddleware = async (ctx: any) => {
				executionLog.push(`middleware-${ctx.operation}`)
				return { type: 'accept' as const }
			}

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [loggingMiddleware],
				capabilities: [
					defineCapability({
						name: 'test',
						operations: {
							op1: defineOperation({
								name: 'op1',
								middleware: [loggingMiddleware],
								handler: async () => ({ ok: true })
							}),
							op2: defineOperation({
								name: 'op2',
								handler: async () => ({ ok: true })
							})
						}
					})
				]
			})

			await capsule.boot()

			await capsule.trigger('test', 'op1', {})
			await capsule.trigger('test', 'op2', {})

			expect(executionLog).toEqual(['middleware-op1', 'middleware-op1', 'middleware-op2'])

			await capsule.shutdown()
		})
	})

	describe('Production Patterns', () => {
		test('auth/validation middleware pattern', async () => {
			const validationMiddleware = async (ctx: any) => {
				const { username, password } = ctx.params

				if (!username || !password) {
					return { type: 'reject' as const, reason: 'Missing credentials' }
				}

				if (password.length < 8) {
					return { type: 'reject' as const, reason: 'Password too short' }
				}

				return { type: 'accept' as const }
			}

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [validationMiddleware],
				capabilities: [
					defineCapability({
						name: 'auth',
						operations: {
							login: defineOperation({
								name: 'login',
								handler: async (ctx) => {
									return { success: true, user: (ctx.params as any).username }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			// Missing credentials
			try {
				await capsule.trigger('auth', 'login', {})
				expect.unreachable('Should reject')
			} catch (error: any) {
				expect(error.message).toContain('Missing credentials')
			}

			// Password too short
			try {
				await capsule.trigger('auth', 'login', { username: 'alice', password: 'short' })
				expect.unreachable('Should reject')
			} catch (error: any) {
				expect(error.message).toContain('Password too short')
			}

			// Valid credentials
			const result = await capsule.trigger('auth', 'login', { username: 'alice', password: 'longpassword123' })
			expect(result.success).toBe(true)
			expect(result.user).toBe('alice')

			await capsule.shutdown()
		})

		test('logging/tracing middleware pattern', async () => {
			const logs: string[] = []

			const tracingMiddleware = async (ctx: any) => {
				logs.push(`started: ${ctx.capability}.${ctx.operation}`)
				return { type: 'accept' as const }
			}

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [tracingMiddleware],
				capabilities: [
					defineCapability({
						name: 'api',
						operations: {
							getUser: defineOperation({
								name: 'getUser',
								handler: async (ctx) => {
									logs.push(`fetching: ${(ctx.params as any).id}`)
									return { id: (ctx.params as any).id, name: 'Alice' }
								}
							}),
							updateUser: defineOperation({
								name: 'updateUser',
								handler: async (ctx) => {
									logs.push(`updating: ${(ctx.params as any).id}`)
									return { success: true }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			await capsule.trigger('api', 'getUser', { id: 123 })
			await capsule.trigger('api', 'updateUser', { id: 123, name: 'Bob' })

			expect(logs).toContain('started: api.getUser')
			expect(logs).toContain('fetching: 123')
			expect(logs).toContain('started: api.updateUser')
			expect(logs).toContain('updating: 123')

			await capsule.shutdown()
		})

		test('rate limiting middleware pattern', async () => {
			const requestCounts = new Map<string, number>()
			const MAX_PER_USER = 2

			const rateLimitMiddleware = async (ctx: any) => {
				const userId = (ctx.params as any).userId
				const count = requestCounts.get(userId) || 0

				if (count >= MAX_PER_USER) {
					return { type: 'reject' as const, reason: 'Rate limit exceeded' }
				}

				requestCounts.set(userId, count + 1)
				return { type: 'accept' as const }
			}

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [rateLimitMiddleware],
				capabilities: [
					defineCapability({
						name: 'api',
						operations: {
							query: defineOperation({
								name: 'query',
								handler: async (ctx) => {
									return { result: 'data' }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			// User 1: two requests (allowed)
			await capsule.trigger('api', 'query', { userId: 'user1' })
			await capsule.trigger('api', 'query', { userId: 'user1' })

			// User 1: third request (rejected)
			try {
				await capsule.trigger('api', 'query', { userId: 'user1' })
				expect.unreachable('Should reject')
			} catch (error: any) {
				expect(error.message).toContain('Rate limit exceeded')
			}

			// User 2: should have own quota
			await capsule.trigger('api', 'query', { userId: 'user2' })
			expect(requestCounts.get('user2')).toBe(1)

			await capsule.shutdown()
		})

		test('request transformation middleware pattern', async () => {
			const transformMiddleware = async (ctx: any) => {
				// Normalize input
				const normalized = {
					...ctx.params,
					name: (ctx.params as any).name?.trim().toUpperCase(),
					email: (ctx.params as any).email?.trim().toLowerCase()
				}

				return { type: 'transform' as const, params: normalized }
			}

			const capsule = Capsule({
				name: 'test-capsule',
				middleware: [transformMiddleware],
				capabilities: [
					defineCapability({
						name: 'users',
						operations: {
							create: defineOperation({
								name: 'create',
								handler: async (ctx) => {
									return { created: ctx.params }
								}
							})
						}
					})
				]
			})

			await capsule.boot()

			const result = await capsule.trigger('users', 'create', {
				name: '  alice  ',
				email: '  ALICE@EXAMPLE.COM  '
			})

			expect(result.created.name).toBe('ALICE')
			expect(result.created.email).toBe('alice@example.com')

			await capsule.shutdown()
		})
	})
})
