import { runCodeInProcess } from "./code";

runCodeInProcess({
    code: "console.log('Hello from REPL!')",
    context: {
        weather: {
            get() {
                return "sunny";
            }
        }
    },
    timeoutMs: 10000,
})