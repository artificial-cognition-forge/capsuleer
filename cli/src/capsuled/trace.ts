import { storage } from "../storage/storage"
import { getInstanceId } from "./traceContext"
import type { CapsuleerEvent } from "../types/events"

/**
 * Trace
 *
 * capsuleer daemon event log.
 * appends to jsonl log file
 */
export type CapsuleerTrace = ReturnType<typeof trace>
const DEBUG = true
export function trace() {
    const log: CapsuleerEvent[] = []
    const callbacks = new Set<(event: CapsuleerEvent) => void>()
    let seq = 0

    return {
        get(): CapsuleerEvent[] {
            return [...log]
        },

        push(event: CapsuleerEvent) {
            const eventWithTime = {
                ...event,
                time: {
                    ms: Date.now(),
                    seq: seq++
                }
            }
            if (DEBUG) console.log(eventWithTime)
            log.push(eventWithTime)
            callbacks.forEach(cb => cb(eventWithTime))
            // Fire and forget - don't block on disk I/O
            storage.log.append(getInstanceId(), eventWithTime).catch((err) => {
                console.error("Failed to append to trace log:", err)
            })
        },

        onEvent: (cb: (event: CapsuleerEvent) => void) => {
            callbacks.add(cb)
        },
    }
}
