import { storage } from "../storage/storage"
import type { CapsuleerEvent } from "../types/events"
import { eventTimestamp } from "./utils/eventTimestamp"
import { randomUUIDv7 } from "bun"

const log: CapsuleerEvent[] = []
const callbacks = new Set<(event: CapsuleerEvent) => void>()

/**
 * Trace
 *
 * capsuleer daemon event log.
 * appends to jsonl log file
 */
export type CapsuleerTrace = ReturnType<typeof trace>
export function trace() {

    return {
        get(): CapsuleerEvent[] {
            return [...log]
        },

        append(event: CapsuleerEvent, opts?: { instanceId?: string }) {

            const eventWithTime = {
                eventId: randomUUIDv7(),
                ...event,
                time: eventTimestamp(),
            }

            log.push(eventWithTime)
            callbacks.forEach(cb => cb(eventWithTime))

            // Append to log.
            storage.log.event(eventWithTime, opts)
        },

        onEvent: (cb: (event: CapsuleerEvent) => void) => {
            callbacks.add(cb)
        },
    }
}

