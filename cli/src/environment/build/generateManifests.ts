import ts from "typescript"
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

export type ManifestEntry = {
    name: string
    declaration: string
    jsdoc?: string
}

export type ModuleManifest = {
    moduleName: string
    description?: string
    exports: ManifestEntry[]
}

/**
 * Extract JSDoc comment from a node
 */
function extractJSDoc(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
    const jsDocTags = ts.getJSDocCommentsAndTags(node)
    if (jsDocTags.length === 0) return undefined

    const comments: string[] = []

    for (const tag of jsDocTags) {
        if (ts.isJSDoc(tag)) {
            const comment = tag.comment
            if (typeof comment === 'string') {
                comments.push(comment)
            } else if (comment) {
                // Handle JSDocComment array
                comments.push(comment.map(c => c.text).join(''))
            }

            // Also extract tag comments (@param, @returns, etc.)
            if (tag.tags) {
                for (const t of tag.tags) {
                    const tagText = t.comment
                    if (typeof tagText === 'string') {
                        comments.push(`@${t.tagName.text} ${tagText}`)
                    } else if (tagText) {
                        comments.push(`@${t.tagName.text} ${tagText.map(c => c.text).join('')}`)
                    }
                }
            }
        }
    }

    return comments.length > 0 ? comments.join('\n').trim() : undefined
}

/**
 * Known complex types that should be simplified for AI consumption
 * Maps type patterns to their simplified representations
 */
const SIMPLIFIED_TYPES: Record<string, string> = {
    'TemplateStringsArray': 'TemplateStringsArray',
    'RequestInit': 'RequestInit',
    'Response': 'Response',
    'Request': 'Request',
    'Headers': 'Headers',
    'FormData': 'FormData',
    'Blob': 'Blob',
    'ArrayBuffer': 'ArrayBuffer',
    'ReadableStream': 'ReadableStream',
    'WritableStream': 'WritableStream',
    'AbortSignal': 'AbortSignal',
    'URL': 'URL',
    'URLSearchParams': 'URLSearchParams',
}

/**
 * Check if a type should be simplified based on property count or complexity
 */
function shouldSimplifyType(type: ts.Type, typeString: string, properties: ts.Symbol[]): boolean {
    // Simplify if type name matches known complex types
    for (const knownType of Object.keys(SIMPLIFIED_TYPES)) {
        if (typeString.includes(knownType)) {
            return true
        }
    }

    // Simplify objects with more than 8 properties (too verbose for AI)
    if (properties.length > 8) {
        return true
    }

    return false
}

/**
 * Recursively expand a type to its full representation
 * This handles object literals and arrays better than the default typeToString
 * Simplifies complex built-in types for AI consumption
 */
function expandType(type: ts.Type, checker: ts.TypeChecker, depth = 0): string {
    // Prevent infinite recursion
    if (depth > 5) {
        return 'any'
    }

    // First, try to get a clean type name with UseAliasDefinedOutsideCurrentScope
    const typeStringWithAlias = checker.typeToString(
        type,
        undefined,
        ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
    )

    // Check for known simplified types using the alias-aware string
    for (const [pattern, replacement] of Object.entries(SIMPLIFIED_TYPES)) {
        if (typeStringWithAlias === pattern || typeStringWithAlias.startsWith(pattern + '<')) {
            return typeStringWithAlias
        }
    }

    const typeString = checker.typeToString(type)

    // Check symbol name for global types
    const symbol = type.getSymbol()
    if (symbol) {
        const symbolName = symbol.getName()
        if (SIMPLIFIED_TYPES[symbolName]) {
            return symbolName
        }
    }

    // Handle arrays
    if (checker.isArrayType(type)) {
        const typeArgs = (type as ts.TypeReference).typeArguments
        if (typeArgs && typeArgs.length > 0) {
            const elemType = expandType(typeArgs[0], checker, depth + 1)
            return `Array<${elemType}>`
        }
    }

    // Handle promises
    if (typeString.startsWith('Promise<')) {
        const typeArgs = (type as ts.TypeReference).typeArguments
        if (typeArgs && typeArgs.length > 0) {
            const innerType = expandType(typeArgs[0], checker, depth + 1)
            return `Promise<${innerType}>`
        }
    }

    // Handle object literals with properties
    const properties = type.getProperties()
    if (properties.length > 0 && (type.flags & ts.TypeFlags.Object)) {
        // Check if we should simplify this type
        if (shouldSimplifyType(type, typeString, properties)) {
            // For complex objects, use a simplified representation
            if (typeString !== '{}') {
                return typeString
            }
            // If it's just {}, show a hint about the structure
            if (properties.length <= 3) {
                const props = properties.slice(0, 3).map(prop => {
                    const propName = prop.getName()
                    return `${propName}: ...`
                })
                return `{ ${props.join('; ')}; ... }`
            }
            return 'object'
        }

        // Expand simple object types (8 or fewer properties)
        const props = properties.map(prop => {
            const propName = prop.getName()
            const propType = checker.getTypeOfSymbol(prop)
            const propTypeStr = expandType(propType, checker, depth + 1)
            const isOptional = prop.flags & ts.SymbolFlags.Optional
            return `${propName}${isOptional ? '?' : ''}: ${propTypeStr}`
        })
        return `{ ${props.join('; ')} }`
    }

    // Default: use typeToString with expansion flags
    return checker.typeToString(
        type,
        undefined,
        ts.TypeFormatFlags.NoTruncation |
        ts.TypeFormatFlags.InTypeAlias |
        ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
        ts.TypeFormatFlags.WriteArrayAsGenericType
    )
}

/**
 * Generate a TypeScript declaration string for a function signature
 */
function generateFunctionDeclaration(
    name: string,
    signature: ts.Signature,
    checker: ts.TypeChecker
): string {
    const params = signature.parameters.map(param => {
        const paramName = param.getName()
        const paramType = checker.getTypeOfSymbol(param)
        const typeString = expandType(paramType, checker)
        const isOptional = param.declarations?.some(d =>
            ts.isParameter(d) && d.questionToken !== undefined
        )
        return `${paramName}${isOptional ? '?' : ''}: ${typeString}`
    }).join(', ')

    const returnType = expandType(signature.getReturnType(), checker)

    return `declare function ${name}(${params}): ${returnType}`
}

/**
 * Generate a TypeScript declaration string for a property (could be function or value)
 */
function generatePropertyDeclaration(
    name: string,
    type: ts.Type,
    checker: ts.TypeChecker
): string {
    const callSignatures = type.getCallSignatures()

    if (callSignatures.length > 0) {
        // It's a function
        return generateFunctionDeclaration(name, callSignatures[0], checker)
    } else {
        // It's a value or namespace
        const typeString = expandType(type, checker)
        return `declare const ${name}: ${typeString}`
    }
}

/**
 * Extract manifest from a module file by analyzing the defineModule call
 */
function extractModuleManifest(filePath: string): ModuleManifest | null {
    const sourceText = readFileSync(filePath, 'utf-8')

    // Create a program with the file
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true
    )

    // Create a minimal program for type checking
    const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
        strict: false,
        skipLibCheck: true,
        skipDefaultLibCheck: true,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        // Enable lib to get built-in types like Promise, Array, etc.
        lib: ['ESNext']
    }

    const host = ts.createCompilerHost(compilerOptions)
    const originalGetSourceFile = host.getSourceFile
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        if (fileName === filePath) {
            return sourceFile
        }
        return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
    }

    const program = ts.createProgram([filePath], compilerOptions, host)
    const checker = program.getTypeChecker()

    let moduleName: string | undefined
    let description: string | undefined
    const entries: ManifestEntry[] = []

    function visit(node: ts.Node) {
        // Look for: export default defineModule({ ... })
        if (ts.isExportAssignment(node) && !node.isExportEquals) {
            const expr = node.expression
            if (ts.isCallExpression(expr)) {
                const callExpr = expr as ts.CallExpression

                // Check if it's a call to defineModule
                if (callExpr.expression.getText(sourceFile) === 'defineModule' &&
                    callExpr.arguments.length > 0) {

                    const arg = callExpr.arguments[0]
                    if (ts.isObjectLiteralExpression(arg)) {
                        // Extract name, description, and api
                        for (const prop of arg.properties) {
                            if (ts.isPropertyAssignment(prop)) {
                                const propName = prop.name.getText(sourceFile)

                                if (propName === 'name' && ts.isStringLiteral(prop.initializer)) {
                                    moduleName = prop.initializer.text
                                }

                                if (propName === 'description' && ts.isStringLiteral(prop.initializer)) {
                                    description = prop.initializer.text
                                }

                                if (propName === 'api') {
                                    // Get the type of the api value
                                    const apiType = checker.getTypeAtLocation(prop.initializer)

                                    // Get all properties of the api object
                                    const properties = apiType.getProperties()

                                    for (const property of properties) {
                                        const name = property.getName()

                                        // Skip internal properties
                                        if (name.startsWith('__')) continue

                                        const propType = checker.getTypeOfSymbol(property)

                                        // Generate declaration
                                        const declaration = generatePropertyDeclaration(name, propType, checker)

                                        // Try to find JSDoc from the property declaration
                                        const declarations = property.getDeclarations()
                                        let jsdoc: string | undefined

                                        if (declarations && declarations.length > 0) {
                                            jsdoc = extractJSDoc(declarations[0], sourceFile)
                                        }

                                        entries.push({
                                            name,
                                            declaration,
                                            jsdoc
                                        })
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        ts.forEachChild(node, visit)
    }

    visit(sourceFile)

    if (!moduleName) return null

    return {
        moduleName,
        description,
        exports: entries
    }
}

/**
 * Check if cached manifests are valid (files haven't changed)
 */
function isCacheValid(cacheFile: string, moduleFiles: string[]): boolean {
    if (!existsSync(cacheFile)) return false

    try {
        const cacheStats = statSync(cacheFile)
        const cacheMtime = cacheStats.mtimeMs

        // Check if any module file is newer than cache
        for (const file of moduleFiles) {
            const fileMtime = statSync(file).mtimeMs
            if (fileMtime > cacheMtime) {
                return false
            }
        }

        return true
    } catch {
        return false
    }
}

/**
 * Generate manifests for all module files in a given modules directory.
 * Uses caching to avoid regenerating on every boot.
 */
export function generateManifestsForDir(modulesDir: string): ModuleManifest[] {
    const cacheFile = join(modulesDir, ".manifests.cache.json")
    const files = readdirSync(modulesDir).filter(f => f.endsWith(".module.ts"))
    const filePaths = files.map(f => join(modulesDir, f))

    // Try to load from cache
    if (isCacheValid(cacheFile, filePaths)) {
        try {
            const cached = JSON.parse(readFileSync(cacheFile, "utf-8"))
            return cached as ModuleManifest[]
        } catch {
            // Cache read failed, regenerate
        }
    }

    // Generate manifests
    const manifests: ModuleManifest[] = []

    for (const file of files) {
        const filePath = join(modulesDir, file)
        try {
            const manifest = extractModuleManifest(filePath)
            if (manifest) {
                manifests.push(manifest)
            }
        } catch (error) {
            console.error(`Error generating manifest for ${file}:`, error)
        }
    }

    // Save to cache
    try {
        writeFileSync(cacheFile, JSON.stringify(manifests, null, 2), "utf-8")
    } catch (error) {
        // Cache write failed, not critical
    }

    return manifests
}

/**
 * Generate manifests for all module files in the modules directory
 * Uses caching to avoid regenerating on every boot
 */
export function generateAllManifests(): ModuleManifest[] {
    const modulesDir = new URL("../modules", import.meta.url).pathname
    const cacheFile = join(modulesDir, ".manifests.cache.json")
    const files = readdirSync(modulesDir).filter(f => f.endsWith(".module.ts"))
    const filePaths = files.map(f => join(modulesDir, f))

    // Try to load from cache
    if (isCacheValid(cacheFile, filePaths)) {
        try {
            const cached = JSON.parse(readFileSync(cacheFile, "utf-8"))
            return cached as ModuleManifest[]
        } catch {
            // Cache read failed, regenerate
        }
    }

    // Generate manifests
    const manifests: ModuleManifest[] = []

    for (const file of files) {
        const filePath = join(modulesDir, file)
        try {
            const manifest = extractModuleManifest(filePath)
            if (manifest) {
                manifests.push(manifest)
            }
        } catch (error) {
            console.error(`Error generating manifest for ${file}:`, error)
        }
    }

    // Save to cache
    try {
        writeFileSync(cacheFile, JSON.stringify(manifests, null, 2), "utf-8")
    } catch (error) {
        // Cache write failed, not critical
    }

    return manifests
}
