/**
 * UNIFIED CAPSULE API
 *
 * Public API for creating Capsule instances.
 * Routes to local or remote implementations based on transport configuration.
 *
 * Single parameter discriminated union pattern:
 * - Local: Capsule({ def, transport: 'local' })
 * - Remote: Capsule({ def, transport: 'ssh', ssh: {...}, remoteName: '...' })
 */

import type { SSHConfig } from "./transports/types.js"
import { LocalCapsuleInstance } from "./local.js"
import { RemoteCapsuleInstance } from "./remote.js"
import type { CapsuleDef, CapsuleInstance } from "types/capsule.js"

/**
 * Discriminated union configuration for Capsule creation.
 *
 * TypeScript will enforce required fields based on the 'transport' discriminator:
 * - transport: 'local' requires only def
 * - transport: 'ssh' requires def, ssh config, and remoteName
 */
export type CapsuleConfig<
    TCapabilities extends readonly any[] = readonly any[],
    TStimulusMap extends Record<string, any> = Record<string, any>
> =
    | {
        def: CapsuleDef<TCapabilities, TStimulusMap>
        transport: 'local'
    }
    | {
        def: CapsuleDef<TCapabilities, TStimulusMap>
        transport: 'ssh'
        ssh: SSHConfig
        remoteName: string
    }

/**
 * Create a Capsule instance - unified public API.
 *
 * Routes to local or remote implementation based on transport configuration.
 * Single config parameter with discriminated union for type safety.
 *
 * @param config - Capsule configuration object
 * @returns CapsuleInstance (local or remote, identical interface)
 *
 * @example
 * // Local (in-process)
 * const capsule = Capsule({
 *   def: myCapsuleDef,
 *   transport: 'local'
 * })
 *
 * @example
 * // Remote (SSH)
 * const capsule = Capsule({
 *   def: myCapsuleDef,
 *   transport: 'ssh',
 *   ssh: {
 *     host: 'example.com',
 *     username: 'user',
 *     auth: { type: 'key', path: '~/.ssh/id_rsa' },
 *     capsulePath: '/usr/local/bin/capsule'
 *   },
 *   remoteName: 'my-capsule'
 * })
 */
export function Capsule<
    TCapabilities extends readonly any[] = readonly any[],
    TStimulusMap extends Record<string, any> = Record<string, any>
>(
    config: CapsuleConfig<TCapabilities, TStimulusMap>
): CapsuleInstance<CapsuleDef<TCapabilities, TStimulusMap>> {
    if (config.transport === 'local') {
        return LocalCapsuleInstance(config.def)
    } else if (config.transport === 'ssh') {
        return RemoteCapsuleInstance(config.def, config.ssh, config.remoteName)
    } else {
        // Exhaustive check - TypeScript will error if new transport types are added
        const _exhaustive: never = config
        throw new Error(`Unknown transport: ${_exhaustive}`)
    }
}
