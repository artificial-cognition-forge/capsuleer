/**
 * Test utilities for Capsule runtime testing.
 *
 * Following Cognos testing principles:
 * - Test behavior through public APIs only
 * - Verify through observables
 * - Always cleanup resources
 */

import { Capsule, defineCapability, defineOperation, defineMiddleware } from "@src/exports"
import type { Stimulus, CapsuleInstance, CapsuleDef, OperationMiddleware } from "@types/mod"

/**
 * Collect all stimuli emitted by a capsule.
 * Returns an array that accumulates stimuli and an unsubscribe function.
 */
export function collectStimuli(capsule: CapsuleInstance) {
    const stimuli: Stimulus[] = []
    const unsubscribe = capsule.onStimulus((s) => stimuli.push(s))
    return { stimuli, unsubscribe }
}

/**
 * Wait for a specific stimulus to be emitted.
 * Returns a promise that resolves with the stimulus when it arrives.
 * Rejects after timeout (default 1000ms).
 */
export function waitForStimulus(
    capsule: CapsuleInstance,
    sense: string,
    timeoutMs = 1000
): Promise<Stimulus> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            unsubscribe()
            reject(new Error(`Timeout waiting for stimulus: ${sense}`))
        }, timeoutMs)

        const unsubscribe = capsule.onStimulus((stimulus) => {
            if (stimulus.sense === sense) {
                clearTimeout(timeout)
                unsubscribe()
                resolve(stimulus)
            }
        })
    })
}

/**
 * Create a simple test capsule with configurable operations.
 */
export function createTestCapsule<T extends Record<string, any>>(config: {
    name?: string
    operations: T
    middleware?: OperationMiddleware[]
    hooks?: {
        boot?: (ctx: any) => Promise<void>
        shutdown?: (ctx: any) => Promise<void>
    }
}) {
    const ops = Object.entries(config.operations).reduce((acc, [name, handler]) => {
        acc[name] = defineOperation({
            name,
            docs: `Test operation: ${name}`,
            signature: `function ${name}(params: any): Promise<any>`,
            handler
        })
        return acc
    }, {} as any)

    const capability = defineCapability({
        name: "test",
        docs: "Test capability",
        operations: ops
    })

    return Capsule({
        def: {
            name: config.name || "test-capsule",
            capabilities: [capability] as const,
            middleware: config.middleware,
            hooks: config.hooks
        },
        transport: 'local'
    })
}

/**
 * Create a long-running operation for abort testing.
 * The operation checks the signal periodically and can be cancelled.
 */
export function createAbortableOperation(durationMs = 1000, checkIntervalMs = 10) {
    return async ({ signal }: { signal: AbortSignal }) => {
        const startTime = Date.now()

        while (Date.now() - startTime < durationMs) {
            if (signal.aborted) {
                throw new Error(`Aborted: ${signal.reason || "unknown"}`)
            }
            await new Promise(resolve => setTimeout(resolve, checkIntervalMs))
        }

        return "completed"
    }
}

/**
 * Create middleware that tracks its invocations.
 * Returns the middleware function and an array to inspect invocations.
 */
export function trackMiddlewareInvocations() {
    const invocations: Array<{
        capability: string
        operation: string
        params: any
    }> = []

    const middleware = defineMiddleware({
        name: "tracking",
        docs: "Tracks middleware invocations",
        async handler(ctx) {
            invocations.push({
                capability: ctx.capability,
                operation: ctx.operation,
                params: ctx.params
            })
            return { type: "accept" }
        }
    })

    return { middleware, invocations }
}

/**
 * Sleep helper for async tests.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Assert that a promise rejects with a specific error message pattern.
 */
export async function assertRejects(
    promise: Promise<any>,
    messagePattern?: string | RegExp
): Promise<Error> {
    try {
        await promise
        throw new Error("Expected promise to reject, but it resolved")
    } catch (error) {
        if (messagePattern) {
            const message = error instanceof Error ? error.message : String(error)
            if (typeof messagePattern === "string") {
                if (!message.includes(messagePattern)) {
                    throw new Error(
                        `Expected error message to include "${messagePattern}", got: ${message}`
                    )
                }
            } else {
                if (!messagePattern.test(message)) {
                    throw new Error(
                        `Expected error message to match ${messagePattern}, got: ${message}`
                    )
                }
            }
        }
        return error as Error
    }
}
