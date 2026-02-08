/**
 * MIDDLEWARE TYPES
 *
 * Defines middleware for intercepting and transforming operation invocations.
 */

import type { OperationInvocationContext } from "./operation"

/**
 * Result of middleware execution.
 * Generic over TParams to ensure transforms preserve type agreement.
 *
 * NON-GOALS (forbidden):
 * - Middleware MUST NOT emit stimuli
 * - Middleware MUST NOT invoke operations
 * - Middleware MUST NOT access execution context
 */
export type MiddlewareResult<TParams> =
    | { type: "accept" }
    | { type: "reject"; reason: string }
    | { type: "transform"; params: TParams }

/**
 * Operation-level middleware.
 * Generic over TParams - transformations must preserve param type.
 *
 * INVARIANT: Middleware sees only invocation metadata, never execution affordances.
 * INVARIANT: Transform results must be type-compatible with operation params.
 */
export type OperationMiddleware<TParams = unknown> = (
    ctx: OperationInvocationContext<TParams>
) => Promise<MiddlewareResult<TParams>>

/**
 * Capsule-level middleware (runs on all operations).
 * Must work with unknown params since it runs across all operations.
 */
export type CapsuleMiddleware = OperationMiddleware<unknown>
