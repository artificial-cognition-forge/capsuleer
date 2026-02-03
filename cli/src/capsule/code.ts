type Input = {
}


type RunCodeOptions = {
    code: string
    context?: Record<string, any>
    timeoutMs?: number
}

type RunCodeResult = {
    result?: any;
    error?: string;
}

const transpiler = new Bun.Transpiler({
    loader: "ts",
    target: "bun",
})

export async function runCodeInProcess({
    code,
    context = {},
    timeoutMs = 10000,
}: RunCodeOptions): Promise<RunCodeResult> {
    try {
        // --- 1. Lightweight sanitization ---
        const forbiddenPatterns = [
            // Infinite loops - catch all variations
            /while\s*\(\s*true\s*\)/i,
            /while\s*\(\s*1\s*\)/i,
            /while\s*\(\s*!false\s*\)/i,
            /do\s*\{[\s\S]*?\}\s*while\s*\(\s*true\s*\)/i,
            /for\s*\(\s*;;\s*\)/,
            /for\s*\([^)]*--[^)]*\)/,  // Decrement loops

            // Function constructor exploits
            /\beval\b/,
            /\bFunction\b/,
            /\.constructor\s*\.\s*constructor/,
            /\[\]\s*\.\s*\w+\s*\.\s*constructor/,  // [].method.constructor patterns
            /\.constructor\s*\(/,  // Block .constructor() calls
            /Object\.getPrototypeOf\s*\(/,
            /getPrototypeOf\s*\(/,

            // Dynamic imports
            /\bimport\s*\(/,
            /await\s+import/,

            // Async escapes
            /setInterval\s*\(/,

            // Memory bombs
            /\.repeat\s*\(\s*\d{7,}\s*\)/,  // Large repeat calls
            /new\s+Array\s*\(\s*\d{7,}\s*\)/,  // Large array allocation
            /new\s+Uint8Array\s*\(/,  // TypedArray allocation
            /new\s+Uint16Array\s*\(/,
            /new\s+Uint32Array\s*\(/,
            /new\s+Int8Array\s*\(/,
            /new\s+Int16Array\s*\(/,
            /new\s+Int32Array\s*\(/,
            /new\s+Float32Array\s*\(/,
            /new\s+Float64Array\s*\(/,
            /Buffer\s*\.\s*alloc/,  // Buffer allocation

            // Recursive patterns
            /const\s+(\w+)\s*=\s*\(\s*\)\s*=>\s*\1/,  // Self-calling arrow functions
            /Promise\s*\.\s*resolve\s*\(\s*\)\s*\.\s*then\s*\(/,  // Microtask recursion

            // Implicit global access
            /\breturn\s+this\b/,  // return this
            /\(\s*\)\s*=>\s*this/,  // () => this

            // Error object exploitation
            /catch\s*\(\s*\w+\s*\)\s*\{[\s\S]*?\.constructor\s*\.\s*constructor/,  // catch with constructor.constructor
            /Error\s*\.\s*prepareStackTrace/,  // Error.prepareStackTrace manipulation

            // Proxy abuse
            /new\s+Proxy\s*\(/,

            // Getter/setter infinite execution
            /get\s+\w+\s*\(\s*\)\s*\{[\s\S]*?while\s*\(/,  // getter with while loop

            // RegExp constructor (in addition to literal ReDoS)
            /new\s+RegExp\s*\(/,
            /\([^)]*\+[^)]*\)\+/,  // Catastrophic backtracking pattern (...+...)+

            // Prototype pollution
            /Object\.prototype/,

            // Note: globalThis, process, require, Bun are safely shadowed in wrapper
            // No need to pattern-block them - shadowing provides protection
        ];

        for (const regex of forbiddenPatterns) {
            if (regex.test(code)) {
                const errorMessage = `Forbidden pattern detected: ${regex.toString()}`

                $agent.emit({
                    type: "sandbox:error",
                    errorType: "forbidden_pattern",
                    errorMessage,
                    codeSnippet: code.slice(0, 100),
                    pattern: regex.toString()
                })

                return { error: errorMessage }
            }
        }

        // --- 2. Wrap code in async function BEFORE transpilation ---
        // This allows top-level returns and awaits to work correctly
        const codeToTranspile = `(async () => {
${code}
})()`;

        // --- 3. Transpile TS -> JS using Bun ---
        const jsCode = transpiler.transformSync(codeToTranspile)

        // --- 4. Wrap execution with shadowed globals ---
        // Shadow dangerous globals in local scope (no strict mode here to allow var shadowing)
        // IMPORTANT: Only shadow globals that aren't in the context to avoid blocking legitimate scope objects
        const contextKeys = Object.keys(context)
        const dangerousGlobals = ['process', 'globalThis', 'require', 'Function', 'eval', 'Bun', 'setInterval', 'setImmediate', 'Object']
        const globalsToShadow = dangerousGlobals.filter(g => !contextKeys.includes(g))

        const shadowDeclarations = globalsToShadow.map(g => `var ${g} = undefined;`).join('\n        ')

        const wrapped = `
        ${shadowDeclarations}
        // Note: setTimeout is allowed for legitimate async patterns, protected by Promise.race timeout

        "use strict";
        return ${jsCode};
      `;

        const fn = new Function(...Object.keys(context), wrapped);
        const exec = fn(...Object.values(context));

        // --- 5. Timeout protection ---
        let timeoutId: Timer | undefined;
        const result = timeoutMs
            ? await Promise.race([
                exec.then((res: any) => {
                    if (timeoutId) clearTimeout(timeoutId);
                    return res;
                }),
                new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        const errorMessage = `Code execution timeout: exceeded ${timeoutMs}ms`

                        $agent.emit({
                            type: "sandbox:error",
                            errorType: "timeout",
                            errorMessage,
                            codeSnippet: code.slice(0, 100)
                        })

                        reject(new Error(errorMessage))
                    }, timeoutMs);
                }),
            ])
            : await exec;

        return { result };
    } catch (err: any) {
        const errorMessage = err.message || String(err)

        $agent.emit({
            type: "sandbox:error",
            errorType: "execution_error",
            errorMessage,
            codeSnippet: code.slice(0, 100)
        })

        return { error: errorMessage };
    }
}


export type $codeT = ReturnType<typeof $codeConstructor>