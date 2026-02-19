export type CapsuleerEvent =
    | DaemonEvent
    | WebsocketEvent
    | CapsuleEvent
    | CtlEvent
    | SDKClientEvent
    | LogEvent

type EventBase = {
    time: {
        ms: number
        seq: number
    }
}

type DaemonEvent =
    | { type: "daemon.started"; version: string }
    | { type: "daemon.stopped"; reason: "signal" | "crash" }
    | { type: "daemon.restarted"; previousPid: number }


// Todo: change to new websocket events : ssh is deprecated here.
type WebsocketEvent =
    | { type: "ssh.start"; port: number }
    | { type: "ssh.stop" }
    | { type: "ssh.connect"; host: string; user: string }
    | { type: "ssh.disconnect"; host: string; reason?: string }
    | { type: "ssh.error"; host: string; error: string }

type CapsuleEvent =
    | { type: "capsule.boot"; capsuleId: string }
    | { type: "capsule.shutdown"; capsuleId: string }
    | { type: "capsule.session.create"; capsuleId: string; sessionId: string }
    | { type: "capsule.session.kill"; capsuleId: string; sessionId: string }


type CtlEvent =
    | { type: "ctl.install.started"; platform: "linux" | "darwin" | "win32" }
    | { type: "ctl.install.completed"; platform: "linux" | "darwin" | "win32"; path: string }
    | { type: "ctl.install.failed"; platform: "linux" | "darwin" | "win32"; error: string }
    | { type: "ctl.uninstall.started"; platform: "linux" | "darwin" | "win32" }
    | { type: "ctl.uninstall.completed"; platform: "linux" | "darwin" | "win32"; path: string }
    | { type: "ctl.uninstall.failed"; platform: "linux" | "darwin" | "win32"; error: string }

type SDKClientEvent =
    // Connection lifecycle
    | { type: "sdk.client.connect.initiated"; capsuleId: string }
    | { type: "sdk.client.connect.transport.success"; durationMs: number }
    | { type: "sdk.client.connect.session.success"; capsuleId: string; sessionId: string; durationMs: number }
    | { type: "sdk.client.connect.error"; capsuleId: string; error: string }
    | { type: "sdk.client.disconnect.initiated" }
    | { type: "sdk.client.disconnect.session.kill" }
    | { type: "sdk.client.disconnect.transport.close" }
    | { type: "sdk.client.disconnect.error"; error: string }
    | { type: "sdk.client.session.attached"; capsuleId: string; sessionId: string }
    | { type: "sdk.client.session.killed"; sessionId: string }

    // RPC request/response tracking
    | { type: "sdk.rpc.request.sent"; id: number; method: string; timeoutMs: number }
    | { type: "sdk.rpc.response.received"; id: number; method: string; durationMs: number }
    | { type: "sdk.rpc.response.timeout"; id: number; method: string; timeoutMs: number }
    | { type: "sdk.rpc.response.error"; id: number; method: string; code: string; message: string }
    | { type: "sdk.transport.line.received"; lineLength: number; isJson: boolean }
    | { type: "sdk.transport.parse.error"; error: string; linePreview: string }

type LogEvent =
    | { type: "log.event"; event: any } & EventBase