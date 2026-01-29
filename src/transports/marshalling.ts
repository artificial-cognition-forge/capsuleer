/**
 * MARSHALLING UTILITIES
 *
 * Serialization/deserialization for Stimuli and protocol messages
 * across the SSH transport boundary.
 */

import type { Stimulus } from "types/stimulus.js"
import type { StimulusEvent, ProtocolMessage } from "./types.js"

/**
 * Marshal a Stimulus into a StimulusEvent for wire transmission
 */
export function marshalStimulus(stimulus: Stimulus): StimulusEvent {
    return {
        type: "stimulus",
        sense: stimulus.sense,
        data: stimulus.data,
        source: stimulus.source,
        timestamp: stimulus.timestamp ?? Date.now()
    }
}

/**
 * Unmarshal a StimulusEvent back into a Stimulus
 */
export function unmarshalStimulus(event: StimulusEvent): Stimulus {
    return {
        sense: event.sense,
        data: event.data,
        source: event.source,
        timestamp: event.timestamp
    }
}

/**
 * Serialize a protocol message to JSON string (for JSONL)
 */
export function serializeMessage(message: ProtocolMessage): string {
    return JSON.stringify(message)
}

/**
 * Deserialize a JSON string to a protocol message
 * Throws if JSON is invalid.
 */
export function deserializeMessage(json: string): ProtocolMessage {
    try {
        return JSON.parse(json) as ProtocolMessage
    } catch (e) {
        throw new Error(`Invalid protocol message: ${json}`)
    }
}
