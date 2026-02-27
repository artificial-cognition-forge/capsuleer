import { $ as bunShell } from "bun"
import { defineModule } from "../build/defineModule"

type SearchInput = {
    query:
    | { type: "text"; query: string }
    | { type: "regex"; pattern: string }
    | { type: "symbol"; name: string }
    | { type: "semantic"; query: string }

    cwd?: string
    glob?: string
    limit?: number
    contextLines?: number
}

type SearchResult = {
    path: string
    score: number
    matches: {
        line: number
        preview: string
    }[]
    chunk?: string
}

function buildRipgrepCommand(input: SearchInput) {
    const cwd = input.cwd ?? "."
    const limit = input.limit ?? 5
    const context = input.contextLines ?? 3

    let pattern = ""
    let flags = "-n --no-heading"

    switch (input.query.type) {
        case "text":
            pattern = input.query.query
            flags += " -F"
            break

        case "regex":
            pattern = input.query.pattern
            break

        case "symbol":
            // v1 heuristic: match common declaration forms
            pattern = `\\b(function|class|interface|type|const|let|var)\\s+${input.query.name}\\b`
            break

        case "semantic":
            throw new Error("Semantic search not supported in v1")
    }

    if (input.glob) {
        flags += ` -g "${input.glob}"`
    }

    return {
        cmd: `rg ${flags} -C ${context} "${pattern}" ${cwd}`,
        limit,
    }
}

async function search(input: SearchInput): Promise<SearchResult[]> {
    const { cmd, limit } = buildRipgrepCommand(input)

    const cwd = input.cwd ?? "."
    const maxResults = limit ?? 5

    const result = await bunShell`${cmd}`

    const stdout =
        typeof result.stdout === "string"
            ? result.stdout
            : result.stdout.toString("utf8")

    if (result.exitCode !== 0 && stdout.trim() === "") {
        return []
    }

    const lines = stdout.split("\n")

    const grouped = new Map<string, SearchResult>()

    for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue

        const match = line.match(/^(.+?):(\d+):(.*)$/)
        if (!match) continue

        const filePath = match[1]
        const lineNumberStr = match[2]
        const content = match[3]

        if (!filePath || !lineNumberStr) continue

        const lineNumber = Number(lineNumberStr)
        if (Number.isNaN(lineNumber)) continue

        // Normalize path relative to cwd if possible
        let normalizedPath = filePath
        if (filePath.startsWith(cwd)) {
            normalizedPath = "." + filePath.slice(cwd.length)
        }

        if (!grouped.has(normalizedPath)) {
            grouped.set(normalizedPath, {
                path: normalizedPath,
                score: 0,
                matches: [],
            })
        }

        const entry = grouped.get(normalizedPath)!
        entry.matches.push({
            line: lineNumber,
            preview: content!.trim(),
        })
        entry.score += 1
    }

    return Array.from(grouped.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
}

export default defineModule({
    name: "search",
    description: "Structured codebase search using ripgrep (text, regex, symbol). Deterministic and ranked.",
    api: {
        search: search,
    },
    globals: {
        search: search,
    }
})