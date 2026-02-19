type DefineModuleInput = {
    name: string
    jsdoc: string
    api: Record<string, any>
}

export function defineModule(input: DefineModuleInput) {
    return {
        name: input.name,
        jsdoc: input.jsdoc,
        api: input.api,
    }
}