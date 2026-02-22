type DefineModuleInput = {
    name: string
    description?: string
    jsdoc: string
    api: Record<string, any>
    /** Optional: expose individual functions/values as top-level globals */
    globals?: Record<string, any>
}

export function defineModule(input: DefineModuleInput) {
    return {
        name: input.name,
        description: input.description,
        jsdoc: input.jsdoc,
        api: input.api,
        globals: input.globals,
    }
}