/**
 * Capsuleer SDK Type Definitions
 *
 * Core types for client-side usage of Capsuleer daemon.
 */

export type SessionId = string & { readonly __brand: 'SessionId' }
export type ProcessId = string & { readonly __brand: 'ProcessId' }

/**
 * Client connection options
 */
export interface ClientOptions {
  host: string
  port: number
  username?: string
}

/**
 * Process event union type
 */
export type ProcessEvent =
  | { type: 'stdout'; data: Uint8Array }
  | { type: 'stderr'; data: Uint8Array }
  | { type: 'exit'; code: number; signal?: string }
  | { type: 'error'; message: string }

/**
 * Process status snapshot
 */
export interface ProcessStatus {
  id: ProcessId
  runtime: 'shell' | 'bun'
  running: boolean
  code?: number
  signal?: string
}

/**
 * Session interface - returned by client.connect()
 */
export interface Session {
  readonly id: SessionId
  readonly capsuleId: string
  readonly capsuleName: string
  readonly createdAt: number

  spawn(runtime: 'shell' | 'bun'): Promise<Process>
  kill(): Promise<void>
  isActive(): boolean
}

/**
 * Process interface - returned by session.spawn()
 */
export interface Process {
  readonly id: ProcessId
  readonly runtime: 'shell' | 'bun'
  readonly sessionId: SessionId
  readonly startedAt: number

  stdin(data: string | Uint8Array): Promise<void>
  stdinEnd(): Promise<void>
  readonly stdout: AsyncIterable<Uint8Array>
  readonly stderr: AsyncIterable<Uint8Array>
  readonly events: AsyncIterable<ProcessEvent>

  kill(): Promise<void>
  detach(): Promise<void>
  status(): Promise<ProcessStatus>

  readonly exited: Promise<{ code: number; signal?: string }>
}

/**
 * Client interface - main entry point
 */
export interface CapsuleClientT {
  connect(capsuleId: string): Promise<Session>
  isConnected(): Promise<boolean>
  disconnect(): Promise<void>
}

/**
 * Internal RPC types (not exported)
 */
export type RPCEvent =
  | { type: 'stdout'; processId: ProcessId; data: string }
  | { type: 'stderr'; processId: ProcessId; data: string }
  | { type: 'exit'; processId: ProcessId; code: number; signal?: string }
  | { type: 'error'; processId: ProcessId; message: string }
