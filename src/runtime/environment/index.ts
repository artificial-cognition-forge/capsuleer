import { loadModules, setup } from "./setup"

async function main() {
    await loadModules()
    await setup()
}

main()