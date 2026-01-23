/**
 * UTILITY FUNCTIONS FOR REMOTE CAPSULE SERVER
 *
 * ID generation, concurrency helpers, and common utilities.
 */

/**
 * Generate a unique request ID
 * Used for tracking concurrent operations
 */
export function generateRequestId(): string {
    return `req-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Safely call a handler and catch errors
 * Returns the result or an error object
 */
export async function safeExecute<T>(
    fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    try {
        const value = await fn()
        return { ok: true, value }
    } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) }
    }
}

/**
 * Wait for a condition to be true with timeout
 */
export function waitFor(
    condition: () => boolean,
    timeoutMs: number = 5000,
    pollIntervalMs: number = 50
): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now()
        const poll = () => {
            if (condition()) {
                resolve()
                return
            }
            if (Date.now() - start > timeoutMs) {
                reject(new Error(`Timeout waiting for condition after ${timeoutMs}ms`))
                return
            }
            setTimeout(poll, pollIntervalMs)
        }
        poll()
    })
}

/**
 * Abort all pending operations
 */
export function abortAllOperations(operations: Map<string, AbortController>): void {
    for (const [_id, controller] of operations) {
        controller.abort("system")
    }
    operations.clear()
}
