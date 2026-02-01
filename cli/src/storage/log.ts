import config from "cli/config";
import type { CapsuleerEvent } from "../types/events";

const root = (instanceId: string) => `${config.storageRoot}/events/${Date.now()}-${instanceId}.jsonl`

/** 
 * Capsuleer Event Log 
 * 
 * Exactly 1 log per deamon instance.
 */
export const log = {
    /** append to the capsuleer jsonl log. */
    log(deamonInstanceId: string, event: CapsuleerEvent) {

    },

    async list() {

    },

    async clear() {

    },
}