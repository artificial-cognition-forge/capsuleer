/**
 * Trigger Tests
 *
 * Tests for operation invocation via capsule.trigger()
 */

import { describe, test, expect } from 'bun:test'
import { Capsule, defineCapability, defineOperation } from '../index.ts'

describe('Capsule Trigger', () => {
  describe('Basic Invocation', () => {
    test('invoke simple call operation', async () => {
      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'echo',
            operations: {
              repeat: defineOperation({
                name: 'repeat',
                handler: async (ctx) => {
                  return { echoed: (ctx.params as any).message }
                }
              })
            }
          })
        ]
      })

      await capsule.boot()
      const result = await capsule.trigger('echo', 'repeat', { message: 'hello' })
      expect(result).toEqual({ echoed: 'hello' })
      await capsule.shutdown()
    })

    test('invoke operation with no parameters', async () => {
      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'test',
            operations: {
              noop: defineOperation({
                name: 'noop',
                handler: async () => {
                  return { ok: true }
                }
              })
            }
          })
        ]
      })

      await capsule.boot()
      const result = await capsule.trigger('test', 'noop', {})
      expect(result).toEqual({ ok: true })
      await capsule.shutdown()
    })

    test('invoke operation returning complex object', async () => {
      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'data',
            operations: {
              complex: defineOperation({
                name: 'complex',
                handler: async (ctx) => {
                  const num = (ctx.params as any).value
                  return {
                    original: num,
                    doubled: num * 2,
                    squared: num * num,
                    nested: {
                      data: { array: [1, 2, 3] }
                    }
                  }
                }
              })
            }
          })
        ]
      })

      await capsule.boot()
      const result = await capsule.trigger('data', 'complex', { value: 5 })
      expect(result).toEqual({
        original: 5,
        doubled: 10,
        squared: 25,
        nested: { data: { array: [1, 2, 3] } }
      })
      await capsule.shutdown()
    })
  })

  describe('Stream Operations', () => {
    test('invoke stream operation returns AsyncIterable', async () => {
      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'counter',
            operations: {
              count: defineOperation({
                name: 'count',
                kind: 'stream',
                params: { limit: { type: 'number' as const } },
                handler: async function* (ctx) {
                  const limit = (ctx.params as any).limit
                  for (let i = 1; i <= limit; i++) {
                    yield i
                  }
                }
              })
            }
          })
        ]
      })

      await capsule.boot()
      const gen = await capsule.trigger('counter', 'count', { limit: 3 })

      const values = []
      for await (const val of gen) {
        values.push(val)
      }

      expect(values).toEqual([1, 2, 3])
      await capsule.shutdown()
    })

    test('stream operation yields complex objects', async () => {
      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'logger',
            operations: {
              events: defineOperation({
                name: 'events',
                kind: 'stream',
                handler: async function* (ctx) {
                  const count = (ctx.params as any).count
                  for (let i = 0; i < count; i++) {
                    yield {
                      index: i,
                      timestamp: Date.now(),
                      message: `event ${i}`
                    }
                  }
                }
              })
            }
          })
        ]
      })

      await capsule.boot()
      const gen = await capsule.trigger('logger', 'events', { count: 2 })

      const events = []
      for await (const evt of gen) {
        events.push(evt)
      }

      expect(events).toHaveLength(2)
      expect(events[0].index).toBe(0)
      expect(events[1].index).toBe(1)
      expect(events[0].message).toBe('event 0')
      await capsule.shutdown()
    })
  })

  describe('Error Handling', () => {
    test('throws on invalid capability name', async () => {
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

      try {
        await capsule.trigger('nonexistent', 'noop', {})
        expect.unreachable('Should have thrown')
      } catch (error: any) {
        expect(error.message).toContain('Capability not found')
      }

      await capsule.shutdown()
    })

    test('throws on invalid operation name', async () => {
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

      try {
        await capsule.trigger('test', 'nonexistent', {})
        expect.unreachable('Should have thrown')
      } catch (error: any) {
        expect(error.message).toContain('Operation not found')
      }

      await capsule.shutdown()
    })

    test('propagates handler errors', async () => {
      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'test',
            operations: {
              fail: defineOperation({
                name: 'fail',
                handler: async (ctx) => {
                  throw new Error(`Handler error: ${(ctx.params as any).message}`)
                }
              })
            }
          })
        ]
      })

      await capsule.boot()

      try {
        await capsule.trigger('test', 'fail', { message: 'custom error' })
        expect.unreachable('Should have thrown')
      } catch (error: any) {
        expect(error.message).toContain('Handler error: custom error')
      }

      await capsule.shutdown()
    })
  })

  describe('Execution Context', () => {
    test('handler receives correct params', async () => {
      let receivedParams: any

      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'test',
            operations: {
              capture: defineOperation({
                name: 'capture',
                handler: async (ctx) => {
                  receivedParams = ctx.params
                  return {}
                }
              })
            }
          })
        ]
      })

      await capsule.boot()
      await capsule.trigger('test', 'capture', { name: 'Alice', age: 30 })

      expect(receivedParams).toEqual({ name: 'Alice', age: 30 })
      await capsule.shutdown()
    })

    test('handler receives AbortSignal', async () => {
      let receivedSignal: any

      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'test',
            operations: {
              capture: defineOperation({
                name: 'capture',
                handler: async (ctx) => {
                  receivedSignal = ctx.signal
                  return {}
                }
              })
            }
          })
        ]
      })

      await capsule.boot()
      await capsule.trigger('test', 'capture', {})

      expect(receivedSignal).toBeInstanceOf(AbortSignal)
      expect(receivedSignal.aborted).toBe(false)
      await capsule.shutdown()
    })

    test('handler can emit stimuli', async () => {
      const stimuli: any[] = []

      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'test',
            operations: {
              emit: defineOperation({
                name: 'emit',
                handler: async (ctx) => {
                  ctx.emit({ sense: 'test:message', data: { msg: (ctx.params as any).message } })
                  return { emitted: true }
                }
              })
            }
          })
        ]
      })

      capsule.onStimulus((s) => stimuli.push(s))
      await capsule.boot()

      const result = await capsule.trigger('test', 'emit', { message: 'hello' })

      expect(result).toEqual({ emitted: true })
      expect(stimuli).toHaveLength(1)
      expect(stimuli[0].sense).toBe('test:message')
      expect(stimuli[0].data).toEqual({ msg: 'hello' })
      expect(stimuli[0].source).toEqual({ capability: 'test', operation: 'emit' })

      await capsule.shutdown()
    })

    test('stimulus includes operation provenance', async () => {
      const stimuli: any[] = []

      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'sensor',
            operations: {
              read: defineOperation({
                name: 'read',
                handler: async (ctx) => {
                  ctx.emit({ sense: 'sensor:data', data: { value: 42 } })
                  return {}
                }
              })
            }
          })
        ]
      })

      capsule.onStimulus((s) => stimuli.push(s))
      await capsule.boot()
      await capsule.trigger('sensor', 'read', {})

      expect(stimuli[0].source.capability).toBe('sensor')
      expect(stimuli[0].source.operation).toBe('read')
      await capsule.shutdown()
    })
  })

  describe('Multiple Operations', () => {
    test('invoke different operations from same capability', async () => {
      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'math',
            operations: {
              add: defineOperation({
                name: 'add',
                handler: async (ctx) => {
                  const params = ctx.params as any
                  return { result: params.a + params.b }
                }
              }),
              multiply: defineOperation({
                name: 'multiply',
                handler: async (ctx) => {
                  const params = ctx.params as any
                  return { result: params.a * params.b }
                }
              })
            }
          })
        ]
      })

      await capsule.boot()

      const sum = await capsule.trigger('math', 'add', { a: 5, b: 3 })
      expect(sum).toEqual({ result: 8 })

      const product = await capsule.trigger('math', 'multiply', { a: 5, b: 3 })
      expect(product).toEqual({ result: 15 })

      await capsule.shutdown()
    })

    test('invoke operations from different capabilities', async () => {
      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'math',
            operations: {
              add: defineOperation({
                name: 'add',
                handler: async (ctx) => {
                  const params = ctx.params as any
                  return { result: params.a + params.b }
                }
              })
            }
          }),
          defineCapability({
            name: 'text',
            operations: {
              upper: defineOperation({
                name: 'upper',
                handler: async (ctx) => {
                  return { result: (ctx.params as any).text.toUpperCase() }
                }
              })
            }
          })
        ]
      })

      await capsule.boot()

      const math = await capsule.trigger('math', 'add', { a: 2, b: 3 })
      expect(math).toEqual({ result: 5 })

      const text = await capsule.trigger('text', 'upper', { text: 'hello' })
      expect(text).toEqual({ result: 'HELLO' })

      await capsule.shutdown()
    })
  })

  describe('Concurrent Operations', () => {
    test('multiple concurrent operations work independently', async () => {
      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'async',
            operations: {
              delay: defineOperation({
                name: 'delay',
                handler: async (ctx) => {
                  const params = ctx.params as any
                  await new Promise((r) => setTimeout(r, params.ms))
                  return { delayed: params.value }
                }
              })
            }
          })
        ]
      })

      await capsule.boot()

      // Start multiple operations concurrently
      const p1 = capsule.trigger('async', 'delay', { ms: 10, value: 1 })
      const p2 = capsule.trigger('async', 'delay', { ms: 20, value: 2 })
      const p3 = capsule.trigger('async', 'delay', { ms: 5, value: 3 })

      const results = await Promise.all([p1, p2, p3])

      expect(results).toEqual([{ delayed: 1 }, { delayed: 2 }, { delayed: 3 }])
      await capsule.shutdown()
    })
  })

  describe('Operation Lifecycle', () => {
    test('operation runs between boot and shutdown', async () => {
      let opRan = false

      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'test',
            operations: {
              run: defineOperation({
                name: 'run',
                handler: async () => {
                  opRan = true
                  return {}
                }
              })
            }
          })
        ]
      })

      expect(opRan).toBe(false)
      await capsule.boot()

      await capsule.trigger('test', 'run', {})
      expect(opRan).toBe(true)

      await capsule.shutdown()
    })

    test('subsequent operations after first work correctly', async () => {
      const results = []

      const capsule = Capsule({
        name: 'test-capsule',
        capabilities: [
          defineCapability({
            name: 'test',
            operations: {
              record: defineOperation({
                name: 'record',
                handler: async (ctx) => {
                  results.push((ctx.params as any).value)
                  return { count: results.length }
                }
              })
            }
          })
        ]
      })

      await capsule.boot()

      const r1 = await capsule.trigger('test', 'record', { value: 1 })
      expect(r1).toEqual({ count: 1 })

      const r2 = await capsule.trigger('test', 'record', { value: 2 })
      expect(r2).toEqual({ count: 2 })

      const r3 = await capsule.trigger('test', 'record', { value: 3 })
      expect(r3).toEqual({ count: 3 })

      expect(results).toEqual([1, 2, 3])
      await capsule.shutdown()
    })
  })
})
