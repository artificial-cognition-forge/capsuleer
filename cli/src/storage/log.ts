import config from "cli/config";
import type { CapsuleerEvent } from "../types/events";
import { readdir, rm } from "node:fs/promises";
import { join } from "path";

const root = (instanceId: string) => `${config.storageRoot}/events/${Date.now()}-${instanceId}.jsonl`
const eventsDir = expand(`${config.storageRoot}/events`)

/**
 * Capsuleer Event Log
 *
 * Exactly 1 log per deamon instance.
 */
export const log = {
    /** append to the capsuleer jsonl log. */
    async log(deamonInstanceId: string, event: CapsuleerEvent) {
        const filepath = root(deamonInstanceId)
        const line = JSON.stringify(event) + "\n"
        await Bun.write(filepath, line)
    },

    async list() {
        try {
            const files = await readdir(eventsDir)
            return files
                .filter(f => f.endsWith('.jsonl'))
                .map(f => join(eventsDir, f))
        } catch {
            return []
        }
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