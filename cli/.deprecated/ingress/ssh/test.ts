
import { Server } from "ssh2"
import * as fs from "fs"
import * as pty from "node-pty"

const server = new Server(
    {
        hostKeys: [fs.readFileSync("./host_key")],
    },
    (client) => {
        console.log("Client connected")

        client.on("authentication", (ctx) => {
            ctx.accept() // allow anything for testing
        })

        client.on("ready", () => {
            console.log("Client authenticated")

            client.on("session", (accept) => {
                const session = accept()

                let shell: pty.IPty | null = null

                session.on("pty", (accept, _reject, info) => {
                    console.log("PTY request", info)
                    accept()
                })

                session.on("shell", (accept) => {
                    console.log("Shell request")

                    const stream = accept()

                    // 🔥 spawn PTY shell

                    shell = pty.spawn("cat", [], {
                        name: "xterm-256color",
                        cols: 80,
                        rows: 24,
                        cwd: process.env.HOME || "/home/cody",
                        env: {
                            ...process.env,
                            HOME: process.env.HOME || "/home/cody",
                            USER: process.env.USER || "cody",
                            SHELL: "/bin/bash",
                            TERM: "xterm-256color",
                        },
                    })
                    // shell = pty.spawn("/bin/bash", ["-l"], {
                    //     name: "xterm-256color",
                    //     cols: 80,
                    //     rows: 24,
                    //     cwd: process.env.HOME || "/home/cody",
                    //     env: {
                    //         ...process.env,
                    //         HOME: process.env.HOME || "/home/cody",
                    //         USER: process.env.USER || "cody",
                    //         SHELL: "/bin/bash",
                    //         TERM: "xterm-256color",
                    //     },
                    // })

                    // ---- PTY → SSH ----
                    shell.onData((data) => {
                        stream.write(data)
                    })

                    // ---- SSH → PTY ----
                    stream.on("data", (data) => {
                        shell?.write(data.toString())
                    })

                    // ---- CLOSE HANDLING ----
                    stream.on("close", () => {
                        shell?.kill()
                        console.log("Stream closed")
                    })

                    shell.onExit(({ exitCode }) => {
                        stream.exit(exitCode ?? 0)
                        stream.end()
                        console.log("Shell exited", exitCode)
                    })
                })

                // 🔥 Window resize support
                session.on("window-change", (_accept, _reject, info) => {
                    shell?.resize(info.cols, info.rows)
                })
            })
        })

        client.on("end", () => {
            console.log("Client disconnected")
        })
    }
)

server.listen(2222, "0.0.0.0", () => {
    console.log("SSH server listening on port 2222")
})