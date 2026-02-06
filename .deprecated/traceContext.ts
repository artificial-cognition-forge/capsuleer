import { trace } from "./trace"
import { randomUUIDv7 } from "bun"

let activeTrace: ReturnType<typeof trace> | null = null
let activeInstanceId: string | null = null

export function setTraceContext(traceInstance: ReturnType<typeof trace>, instanceId: string) {
    activeTrace = traceInstance
    activeInstanceId = instanceId
}

export function getTrace() {
    if (!activeTrace) {
        // Auto-initialize trace if not set
        activeTrace = trace()
        if (!activeInstanceId) {
            activeInstanceId = randomUUIDv7()
        }
    }
    return activeTrace
}

export function getInstanceId() {
    if (!activeInstanceId) {
        // Auto-initialize if needed
        activeInstanceId = randomUUIDv7()
        if (!activeTrace) {
            activeTrace = trace()
        }
    }
    return activeInstanceId
}

export function clearTraceContext() {
    activeTrace = null
    activeInstanceId = null
}
