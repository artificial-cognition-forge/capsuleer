
export async function help() {
  console.log(`
Capsuleer CLI - Capability-based containerization

USAGE:
  capsuleer <command> [subcommand] [options]

COMMANDS:
  repl                     Start an interactive TypeScript REPL
                           - Direct access to capsule environment
                           - Auto-discovery of available modules
                           - Real-time code execution

  daemon                   Manage the capsuleer daemon
    start                  Start the daemon (boots capsule + SSH server)
    stop                   Stop the daemon
    restart                Restart the daemon
    health                 Check daemon health
    install                Install systemd/launchd service

  auth                     Manage SSH authentication keys
    add <key-path> [name]  Register a public key
                           - key-path: path to public key file or raw key
                           - name: optional name for the key
    list                   List all registered keys
    remove <fingerprint>   Remove a key by fingerprint

  capsule                  Manage capsules
    list                   List all capsules
    start                  Start the default capsule
    stop                   Stop the default capsule
    connect [id] [key] [user]  SSH into a capsule
                           - id: capsule ID (default: "default")
                           - key: path to private SSH key (optional)
                           - user: SSH username (optional)

EXAMPLES:
  # Start an interactive REPL
  capsuleer repl

  # Register an SSH public key
  capsuleer auth add ~/.ssh/id_rsa.pub

  # List registered keys
  capsuleer auth list

  # Remove a key
  capsuleer auth remove a1b2c3d4e5f6g7h8

  # Start the daemon
  capsuleer daemon start

  # Connect to default capsule
  capsuleer capsule connect

  # Connect with specific key and user
  capsuleer capsule connect default ~/.ssh/id_rsa user

  # Check daemon status
  capsuleer daemon health
        `)
}