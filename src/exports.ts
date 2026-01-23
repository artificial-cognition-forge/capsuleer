export { Capsule } from "./Capsule.js"
export { LocalCapsuleInstance } from "./local.js"
export { RemoteCapsuleInstance } from "./remote.js"
export * from "./defineCapability.js"
export * from "./defineMiddleware.js"
export * from "./defineOperation.js"

// Transport types and utilities
export * from "./transports/types.js"
export { JSONLProtocolHandler } from "./transports/protocol.js"
export * from "./transports/marshalling.js"