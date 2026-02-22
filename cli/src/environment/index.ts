import { loadModules, setup } from "./build/setup"

async function main() {
    await loadModules()
    await setup()
}

main()