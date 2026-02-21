
function eventTimestamp() {
    return {
        ms: Date.now(),
        seq: 0,
    }
}

type CapsuleerEvent = Record<string, unknown>

const log: CapsuleerEvent[] = []
const callbacks = new Set<(event: CapsuleerEvent) => void>()

/**
 * Trace
 *
 * capsuleer daemon event log (in-memory).
 */
export type CapsuleerTrace = ReturnType<typeof trace>
export function trace() {

    return {
        get(): CapsuleerEvent[] {
            return [...log]
        },

        append(event: CapsuleerEvent) {
            const eventWithTime = {
                eventId: crypto.randomUUID(),
                ...event,
                time: eventTimestamp(),
            }

            log.push(eventWithTime)
            callbacks.forEach(cb => cb(eventWithTime))
        },

        onEvent: (cb: (event: CapsuleerEvent) => void) => {
            callbacks.add(cb)
            return () => callbacks.delete(cb)
        },
    }
}
