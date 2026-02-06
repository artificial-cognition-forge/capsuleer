export type CapsuleerEvent =
    | DaemonEvent
    | SSHEvent
    | CapsuleEvent
    | CtlEvent
    | RPCEvent

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
    | { type: "rpc.session.attach"; capsuleId: string; sessionId: string }
    | { type: "rpc.session.detach"; capsuleId: string; sessionId: string; transportId: string }
    | { type: "rpc.process.spawn"; capsuleId: string; sessionId: string; processId: string; runtime: "shell" | "bun" }
    | { type: "rpc.process.exit"; capsuleId: string; sessionId: string; processId: string; code: number; signal?: string }
    | { type: "rpc.process.error"; capsuleId: string; sessionId: string; processId: string; error: string }
