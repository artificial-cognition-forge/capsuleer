import repl from "node:repl"

const r = repl.start({
    prompt: "> ",
    useColors: true,
    ignoreUndefined: true,
    preview: false,
    useGlobal: false,
})

r.context.log = console.log
r.context.hello = "hello there"