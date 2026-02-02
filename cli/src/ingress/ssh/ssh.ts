import type { CapsuleerEvent } from "cli/src/types/events";

const ssh = {
    async connect() { },
    async disconnect() { },
    async health() { },

    async attach(stream: NodeJS.ReadWriteStream): Promise<void> { },
    async onEvent(cb: (event: CapsuleerEvent) => void) { },
}