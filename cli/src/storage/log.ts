import config from "cli/config";
import type { CapsuleerEvent } from "../types/events";
import { readdir, rm, mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { daemonInstanceId } from "../capsuled/utils/daemonInstanceId";


/**
 * Capsuleer Event Log
 *
 * Exactly 1 log per deamon instance.
 */
export const log = {
    /** Get the current log file path for a daemon instance */
    getLogPath(instanceId: string): string {
        return getLogPath(instanceId)
    },

    /** List all log file paths. */
    async list() {
        try {
            await mkdir(eventsDir, { recursive: true })
            const files = await readdir(eventsDir)
            return files
                .filter(f => f.endsWith('.jsonl'))
                .map(f => join(eventsDir, f))
                .sort()
                .reverse()
        } catch {
            return []
        }
    },

    async append(daemonInstanceId: string, event: CapsuleerEvent) {
        await log.init()

        const filepath = getLogPath(daemonInstanceId)
        const line = JSON.stringify(event) + "\n"

        await appendFile(filepath, line)
    },

    /** Ensure the log directory exists */
    async init() {
        await mkdir(eventsDir, { recursive: true })
    },

    /** Shorthand for appending an event to the log */
    async event(event: CapsuleerEvent, opts?: { instanceId?: string }) {
        const instanceId = opts?.instanceId || daemonInstanceId
        await log.append(instanceId, event)
    },

    async clear() {
        try {
            const files = await log.list()
            for (const file of files) {
                await rm(file)
            }
        } catch {
            // directory may not exist yet
        }
    },
}

const expandUser = (path: string): string => {
    if (path.startsWith('~')) {
        return join(homedir(), path.slice(2))
    }
    return path
}

const eventsDir = expandUser(`${config.storageRoot}/events`)

// Map to track the current log file for each daemon instance
const instanceLogFiles = new Map<string, string>()

const getLogPath = (instanceId: string): string => {
    if (!instanceLogFiles.has(instanceId)) {
        const timestamp = Date.now()
        const filename = `${timestamp}-${instanceId}.jsonl`
        instanceLogFiles.set(instanceId, join(eventsDir, filename))
    }
    return instanceLogFiles.get(instanceId)!
}