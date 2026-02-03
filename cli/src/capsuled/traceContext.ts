import type { ReturnType } from "bun"
import { trace } from "./trace"

let activeTrace: ReturnType<typeof trace> | null = null
let activeInstanceId: string | null = null

export function setTraceContext(traceInstance: ReturnType<typeof trace>, instanceId: string) {
    activeTrace = traceInstance
    activeInstanceId = instanceId
}

export function getTrace() {
    if (!activeTrace) return null
    return activeTrace
}

export function getInstanceId() {
    if (!activeInstanceId) throw new Error("Instance ID not initialized. Did you call setTraceContext()?")
    return activeInstanceId
}

export function clearTraceContext() {
    activeTrace = null
    activeInstanceId = null
}
