/**
 * Capsuleer SDK
 *
 * Programmatic client interface to Capsuleer daemon.
 * Hides SSH transport complexity and exposes clean async/await API.
 *
 * @example
 * ```ts
 * import { CapsuleerClient } from '@arcforge/capsuleer-client'
 *
 * const client = CapsuleerClient({
 *   host: '127.0.0.1',
 *   port: 22
 * })
 *
 * const session = await client.connect('default')
 * const proc = await session.spawn('shell')
 *
 * proc.stdin('echo "Hello"\n')
 *
 * for await (const chunk of proc.stdout) {
 *   process.stdout.write(chunk)
 * }
 *
 * const { code } = await proc.exited
 * await client.disconnect()
 * ```
 */

export { CapsuleerClient as CapsuleerClient } from './client'

export type {
  CapsuleerClientT,
  Session,
  Process,
  ProcessEvent,
  ProcessStatus,
  ClientOptions,
  SessionId,
  ProcessId,
} from './types'
