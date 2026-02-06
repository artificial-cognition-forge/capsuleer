export type CapsuleerEvent =
    | DaemonEvent
    | SSHEvent
    | CapsuleEvent
    | CtlEvent
    | RPCEvent
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

type SSHEvent =
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

type RPCEvent =
    // Handler lifecycle
    | { type: "rpc.handler.started"; capsuleId?: string }
    | { type: "rpc.handler.ready"; capsuleId?: string }
    | { type: "rpc.handler.shutdown"; capsuleId?: string; reason?: string }

    // Request/Response transport
    | { type: "rpc.request.received"; id: number; method: string; paramKeys: string[] }
    | { type: "rpc.request.dispatch"; id: number; method: string; capsuleId?: string; sessionId?: string }
    | { type: "rpc.response.sent"; id: number; method: string; resultKeys?: string[]; error?: string }
    | { type: "rpc.response.error"; id: number; method: string; code: string; message: string }
    | { type: "rpc.request.timeout"; id: number; method: string; timeoutMs: number }

    // Session management
    | { type: "rpc.session.attach"; capsuleId: string; sessionId: string }
    | { type: "rpc.session.attach.error"; capsuleId: string; error: string }
    | { type: "rpc.session.detach"; capsuleId: string; sessionId: string; transportId: string }
    | { type: "rpc.session.terminate"; capsuleId: string; sessionId: string }

    // Process management
    | { type: "rpc.process.spawn"; capsuleId: string; sessionId: string; processId: string; runtime: "shell" | "bun" }
    | { type: "rpc.process.spawn.error"; capsuleId: string; sessionId: string; error: string }
    | { type: "rpc.process.exit"; capsuleId: string; sessionId: string; processId: string; code: number; signal?: string }
    | { type: "rpc.process.error"; capsuleId: string; sessionId: string; processId: string; error: string }
    | { type: "rpc.process.stdin"; capsuleId: string; sessionId: string; processId: string; bytes: number }
    | { type: "rpc.process.stdin.error"; capsuleId: string; sessionId: string; processId: string; error: string }
    | { type: "rpc.process.kill"; capsuleId: string; sessionId: string; processId: string; signal: string }
    | { type: "rpc.process.kill.error"; capsuleId: string; sessionId: string; processId: string; error: string }

    // Stream events
    | { type: "rpc.stream.subscribe"; capsuleId: string; sessionId: string; processId: string }
    | { type: "rpc.stream.data"; capsuleId: string; sessionId: string; processId: string; source: "stdout" | "stderr"; bytes: number }
    | { type: "rpc.stream.exit"; capsuleId: string; sessionId: string; processId: string; code: number; signal?: string }
    | { type: "rpc.stream.error"; capsuleId: string; sessionId: string; processId: string; source: "stdout" | "stderr" | "exit"; error: string }

    // Event routing
    | { type: "rpc.event.emit"; capsuleId: string; sessionId: string; eventType: string; transportCount: number }
    | { type: "rpc.event.write"; capsuleId: string; sessionId: string; transportId: string; eventType: string; bytes: number }
    | { type: "rpc.event.write.error"; capsuleId: string; sessionId: string; transportId: string; error: string }

    // Debugging/diagnostics
    | { type: "rpc.debug.line.received"; line: string }
    | { type: "rpc.debug.parse.error"; line: string; error: string }

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