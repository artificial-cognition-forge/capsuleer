import { defineModule } from "../build/defineModule"
import { google as googleapis } from "googleapis"

type GoogleSearchInput =
    | string
    | {
        query: string
        limit?: number
        recencyDays?: number
        type?: "web" | "news"
    }

type SearchItem = {
    title: string
    url: string
    snippet: string
    source?: string
    date?: string
}

type GoogleSearchOutput = {
    query: string
    results: SearchItem[]
}

const customsearch = googleapis.customsearch("v1")

const google = {
    async search(input: GoogleSearchInput): Promise<GoogleSearchOutput> {
        const args =
            typeof input === "string"
                ? { query: input }
                : input

        const apiKey = process.env.GOOGLE_API_KEY
        const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

        if (!apiKey || !searchEngineId) {
            throw new Error(
                "Missing environment variables: GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID are required.\n" +
                "Get your API key from: https://console.cloud.google.com/apis/credentials\n" +
                "Create a Custom Search Engine at: https://programmablesearchengine.google.com/"
            )
        }

        try {
            const response = await customsearch.cse.list({
                auth: apiKey,
                cx: searchEngineId,
                q: args.query,
                num: args.limit ?? 10,
                dateRestrict: args.recencyDays ? `d${args.recencyDays}` : undefined,
                searchType: args.type === "news" ? undefined : undefined, // Google CSE doesn't have a direct news filter
            })

            const items = response.data.items || []

            const results: SearchItem[] = items.map((item) => ({
                title: item.title || "",
                url: item.link || "",
                snippet: item.snippet || "",
                source: item.displayLink,
                date: item.pagemap?.metatags?.[0]?.["article:published_time"],
            }))

            return {
                query: args.query,
                results,
            }
        } catch (error) {
            throw new Error(`Google search failed: ${error}`)
        }
    },

    async fetch(url: string): Promise<{
        url: string
        content: string
    }> {
        try {
            const response = await fetch(url)
            const html = await response.text()

            // Basic HTML stripping - convert to text
            // You might want to use a library like 'cheerio' or 'node-html-parser' for better extraction
            const text = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // Remove styles
                .replace(/<[^>]+>/g, ' ')                          // Strip HTML tags
                .replace(/\s+/g, ' ')                              // Normalize whitespace
                .trim()

            return {
                url,
                content: text,
            }
        } catch (error) {
            throw new Error(`Failed to fetch ${url}: ${error}`)
        }
    },

    help(): void {
        console.log(`
# google

Web search and content fetching utilities powered by Google Custom Search API.

## Setup

Requires two environment variables:
- \`GOOGLE_API_KEY\`: Get from https://console.cloud.google.com/apis/credentials
- \`GOOGLE_SEARCH_ENGINE_ID\`: Create at https://programmablesearchengine.google.com/

Free tier: 100 queries per day

## API

\`\`\`ts
declare global {
  type GoogleSearchInput = string | {
    query: string
    limit?: number           // Max results (default: 10, max: 10 per request)
    recencyDays?: number     // Filter by date (e.g., 7 for last week)
    type?: "web" | "news"
  }

  type SearchItem = {
    title: string
    url: string
    snippet: string
    source?: string
    date?: string
  }

  type GoogleSearchOutput = {
    query: string
    results: SearchItem[]
  }

  const google: {
    /** Search the web using Google Custom Search */
    search(input: GoogleSearchInput): Promise<GoogleSearchOutput>

    /** Fetch a URL and extract text content */
    fetch(url: string): Promise<{ url: string; content: string }>

    /** Print this help page */
    help(): void
  }
}
\`\`\`

## Examples

\`\`\`ts
// Simple search
const results = await google.search("TypeScript best practices")
console.log(results.results[0].title)
console.log(results.results[0].url)

// Advanced search with options
const recent = await google.search({
  query: "AI news",
  limit: 10,
  recencyDays: 7,
})

// Fetch and extract content from a URL
const page = await google.fetch("https://example.com/article")
console.log(page.content)

// Combine search + fetch
const results = await google.search("React hooks tutorial")
const firstResult = await google.fetch(results.results[0].url)
console.log(firstResult.content)
\`\`\`
`.trim())
    }
}

export default defineModule({
    name: "google",
    description: "Web search and content fetching powered by Google Custom Search",
    jsdoc: "declare const google: { search(input: string | { query: string; limit?: number; recencyDays?: number; type?: 'web' | 'news' }): Promise<{ query: string; results: Array<{ title: string; url: string; snippet: string; source?: string; date?: string }> }>; fetch(url: string): Promise<{ url: string; content: string }>; help(): void }",
    api: google,
})