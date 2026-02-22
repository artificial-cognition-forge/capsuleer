import ts from "typescript"
import { readFileSync, readdirSync } from "node:fs"
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
        const typeString = checker.typeToString(paramType, undefined, ts.TypeFormatFlags.NoTruncation)
        const isOptional = param.declarations?.some(d =>
            ts.isParameter(d) && d.questionToken !== undefined
        )
        return `${paramName}${isOptional ? '?' : ''}: ${typeString}`
    }).join(', ')

    const returnType = checker.typeToString(
        signature.getReturnType(),
        undefined,
        ts.TypeFormatFlags.NoTruncation
    )

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
        const typeString = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
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
        strict: true,
        skipLibCheck: true,
        moduleResolution: ts.ModuleResolutionKind.Node10
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
 * Generate manifests for all module files in the modules directory
 */
export function generateAllManifests(): ModuleManifest[] {
    const modulesDir = new URL("../modules", import.meta.url).pathname
    const files = readdirSync(modulesDir).filter(f => f.endsWith(".module.ts"))

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

    return manifests
}
