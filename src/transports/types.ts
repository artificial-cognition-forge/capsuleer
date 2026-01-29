/**
 * TRANSPORT TYPES
 *
 * Defines SSH configuration and JSONL protocol message types.
 */

import type { CapsuleMetadata } from "types/metadata"
import type { SSHConfig } from "types/ssh"

export type { SSHConfig }

/**
 * Boot request - initialize remote capsule
 */
export type BootMessage = {
    type: "boot"
    capsuleName: string
}

/**
 * Boot response - capsule ready
 */
export type BootResponse = {
    type: "boot"
    ready: boolean
    metadata?: CapsuleMetadata
    error?: string
}

/**
 * Trigger request - invoke an operation
 */
export type TriggerMessage = {
    id: string
    type: "trigger"
    capability: string
    operation: string
    params: unknown
    signalAborted?: boolean
}

/**
 * Trigger response - operation completed
 */
export type TriggerResponse = {
    id: string
    type: "response"
    result?: unknown
    error?: string
}

/**
 * Abort request - cancel in-flight operation
 */
export type AbortMessage = {
    id: string
    type: "abort"
    reason: string
}

/**
 * Stimulus event - emitted from remote capsule
 */
export type StimulusEvent = {
    type: "stimulus"
    sense: string
    data: unknown
    source?: {
        capability?: string
        operation?: string
    }
    timestamp: number
}

/**
 * Shutdown request - gracefully stop capsule
 */
export type ShutdownMessage = {
    type: "shutdown"
}

/**
 * Shutdown response - capsule stopped
 */
export type ShutdownResponse = {
    type: "shutdown"
    ok: boolean
    error?: string
}

/**
 * Stream data message - data chunk from stream operation
 */
export type StreamDataMessage = {
    id: string
    type: "stream-data"
    data: unknown
}

/**
 * Stream end message - stream operation completed
 */
export type StreamEndMessage = {
    id: string
    type: "stream-end"
    error?: string
}

/**
 * Protocol message - union of all message types
 */
export type ProtocolMessage =
    | BootMessage
    | BootResponse
    | TriggerMessage
    | TriggerResponse
    | AbortMessage
    | StimulusEvent
    | ShutdownMessage
    | ShutdownResponse
    | StreamDataMessage
    | StreamEndMessage

/**
 * Event that arrives on JSONL stream
 */
export type StreamEvent =
    | StimulusEvent
    | TriggerResponse
    | BootResponse
    | ShutdownResponse
    | StreamDataMessage
    | StreamEndMessage
