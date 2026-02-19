import { defineModule } from "../../defineModule"

const fs = {
    async read(path: string) {
        return "HELLO"
    },
}

export default defineModule({
    name: "fs",
    jsdoc: "declare const fs: { read(path: string): Promise<string> }",
    api: fs
})