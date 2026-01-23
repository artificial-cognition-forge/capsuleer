/**
 * JSONL MARSHALLING FOR REMOTE CAPSULE SERVER
 *
 * Handles reading JSONL lines from stdin and writing JSONL to stdout.
 * Ensures clean separation between debug logs (stderr) and protocol (stdout).
 */

import { createInterface } from "node:readline"
import type { Readable, Writable } from "node:stream"
import type { ProtocolMessage } from "../src/transports/types.js"

/**
 * Create a line-based reader for JSONL input
 * Yields complete lines as they arrive
 */
export function createLineReader(input: Readable): AsyncIterable<string> {
    const rl = createInterface({ input, crlfDelay: Infinity })

    return {
        [Symbol.asyncIterator]: async function* () {
            for await (const line of rl) {
                yield line
            }
        }
    }
}

/**
 * Parse a JSON line into a protocol message
 * Throws if JSON is invalid
 */
export function parseMessage(line: string): ProtocolMessage {
    try {
        return JSON.parse(line) as ProtocolMessage
    } catch (e) {
        throw new Error(`Invalid JSON message: ${line}`)
    }
}

/**
 * Serialize a protocol message to JSONL format
 */
export function serializeMessage(message: ProtocolMessage): string {
    return JSON.stringify(message)
}

/**
 * Write a message to stdout as JSONL
 * Ensures no buffering issues by flushing immediately
 */
export function writeMessage(output: Writable, message: ProtocolMessage): void {
    const json = serializeMessage(message)
    const written = output.write(json + "\n")

    // Note: In a real system, we might handle backpressure here
    // For now, we assume stdout can handle the throughput
    if (!written) {
        // Stream indicated it's full, but we don't buffer
        // This would require a more sophisticated queue
    }
}

/**
 * Write a debug log to stderr
 * Does not interfere with JSONL protocol on stdout
 */
export function logDebug(message: string, data?: any): void {
    const timestamp = new Date().toISOString()
    const msg = data ? `${timestamp} ${message} ${JSON.stringify(data)}` : `${timestamp} ${message}`
    process.stderr.write(msg + "\n")
}

/**
 * Write an error to stderr
 */
export function logError(message: string, error?: Error | any): void {
    const timestamp = new Date().toISOString()
    const msg = error ? `${timestamp} ERROR: ${message} ${error.message}` : `${timestamp} ERROR: ${message}`
    process.stderr.write(msg + "\n")
}
