import type { OperationMiddleware } from "./SPECIFICATION"

/**
 * Helper to define middleware.
 * Returns the handler unchanged - pure identity function for type preservation.
 */
export function defineMiddleware<TParams = unknown>(input: {
    name: string
    docs: string
    handler: OperationMiddleware<TParams>
}): OperationMiddleware<TParams> {
    return input.handler
}
