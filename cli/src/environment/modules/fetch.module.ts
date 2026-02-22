import { defineModule } from "../build/defineModule"
import { fetch } from "bun"

type FetchOptions<T = any> = RequestInit & {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
    query?: Record<string, string | number | boolean>
    body?: any
    params?: Record<string, string | number | boolean>
    timeout?: number
    responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer'
    onRequest?: (ctx: { request: string; options: FetchOptions }) => void | Promise<void>
    onResponse?: (ctx: { response: Response }) => void | Promise<void>
}

async function $fetch<T = any>(url: string, options: FetchOptions<T> = {}): Promise<T> {
    let finalUrl = url

    // Add query/params
    const queryParams = options.query || options.params
    if (queryParams) {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(queryParams)) {
            params.append(key, String(value))
        }
        const separator = url.includes('?') ? '&' : '?'
        finalUrl += separator + params.toString()
    }

    // Prepare request options
    const requestInit: RequestInit = {
        method: options.method || 'GET',
        headers: options.headers,
        signal: options.signal,
    }

    // Auto-serialize body
    if (options.body !== undefined) {
        if (typeof options.body === 'string') {
            requestInit.body = options.body
        } else {
            requestInit.body = JSON.stringify(options.body)
            requestInit.headers = {
                'Content-Type': 'application/json',
                ...requestInit.headers,
            }
        }
    }

    // Handle timeout
    const controller = new AbortController()
    let timeoutId: Timer | undefined

    if (options.timeout) {
        timeoutId = setTimeout(() => controller.abort(), options.timeout)
        requestInit.signal = controller.signal
    }

    // onRequest hook
    if (options.onRequest) {
        await options.onRequest({ request: finalUrl, options })
    }

    try {
        const response = await fetch(finalUrl, requestInit)
        if (timeoutId) clearTimeout(timeoutId)

        // onResponse hook
        if (options.onResponse) {
            await options.onResponse({ response })
        }

        // Auto-parse response based on responseType or content-type
        const responseType = options.responseType

        if (responseType === 'text') {
            return await response.text() as T
        }
        if (responseType === 'blob') {
            return await response.blob() as T
        }
        if (responseType === 'arrayBuffer') {
            return await response.arrayBuffer() as T
        }

        // Default to JSON
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
            return await response.json() as T
        }

        // Fallback to text for non-JSON responses
        return await response.text() as T

    } catch (error) {
        if (timeoutId) clearTimeout(timeoutId)
        throw error
    }
}

const fetchHelpers = {
    $fetch,

    help(): void {
        console.log(`
# $fetch

Clean HTTP client inspired by Nuxt's $fetch with auto-parsing and simple API.

## API

\`\`\`ts
declare global {
  function $fetch<T = any>(url: string, options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
    query?: Record<string, string | number | boolean>
    params?: Record<string, string | number | boolean>  // Alias for query
    body?: any                                           // Auto-serialized to JSON
    headers?: HeadersInit
    timeout?: number
    responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer'
    onRequest?: (ctx: { request: string; options: any }) => void | Promise<void>
    onResponse?: (ctx: { response: Response }) => void | Promise<void>
  }): Promise<T>
}
\`\`\`

## Examples

\`\`\`ts
// Simple GET (auto-parses JSON)
const user = await $fetch("https://api.github.com/users/octocat")
console.log(user.name)

// GET with query params
const repos = await $fetch("https://api.github.com/search/repositories", {
  query: { q: "typescript", sort: "stars", order: "desc" }
})
console.log(repos.items[0].name)

// POST with JSON body
const created = await $fetch("https://api.example.com/users", {
  method: "POST",
  body: {
    name: "Alice",
    email: "alice@example.com"
  }
})

// PUT request
await $fetch("https://api.example.com/users/123", {
  method: "PUT",
  body: { name: "Alice Updated" }
})

// DELETE request
await $fetch("https://api.example.com/users/123", {
  method: "DELETE"
})

// With timeout (5 seconds)
const data = await $fetch("https://slow-api.com/data", {
  timeout: 5000
})

// With custom headers
const data = await $fetch("https://api.example.com/data", {
  headers: {
    "Authorization": "Bearer token123",
    "X-Custom-Header": "value"
  }
})

// Get text instead of JSON
const html = await $fetch("https://example.com", {
  responseType: "text"
})

// With hooks
const data = await $fetch("https://api.example.com/data", {
  onRequest({ request, options }) {
    console.log("Fetching:", request)
  },
  onResponse({ response }) {
    console.log("Status:", response.status)
  }
})

// TypeScript with generics
type User = { id: number; name: string; email: string }
const user = await $fetch<User>("https://api.example.com/users/1")
console.log(user.name) // Fully typed!
\`\`\`
`.trim())
    }
}

export default defineModule({
    name: "fetch",
    description: "HTTP client with auto-parsing and simple API",
    api: fetchHelpers,
    globals: {
        $fetch
    }
})
