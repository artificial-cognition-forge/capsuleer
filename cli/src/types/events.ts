export type CapsuleerEvent =
    | DaemonEvent
    | SSHEvent
    | TmuxEvent
    | CapsuleEvent


type DaemonEvent =
    | { type: "daemon.started"; version: string }
    | { type: "daemon.stopped"; reason: "signal" | "crash" }
    | { type: "daemon.restarted"; previousPid: number }

type SSHEvent =
    | { type: "ssh.connect"; host: string; user: string }
    | { type: "ssh.disconnect"; host: string; reason?: string }
    | { type: "ssh.error"; host: string; error: string }

type TmuxEvent =
    | { type: "tmux.server.started"; serverId: string }
    | { type: "tmux.server.stopped"; serverId: string }
    | { type: "tmux.session.created"; serverId: string; session: string }
    | { type: "tmux.session.killed"; serverId: string; session: string }

type CapsuleEvent =
    | { type: "capsule.spawned"; capsuleId: string; command: string }
    | { type: "capsule.output"; capsuleId: string; bytes: number }
    | { type: "capsule.input"; capsuleId: string; bytes: number }
    | { type: "capsule.exited"; capsuleId: string; code: number | null }
