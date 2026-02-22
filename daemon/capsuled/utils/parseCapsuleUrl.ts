type CapsulePrefix = `capsule://`
type CapsuleName = string
type Host = string
type Port = string
type Endpoint = "repl" | string  // defaults to shell

type Username = string
type Password = string

type User = `${Username}:${Password}@` | undefined

type ConnectionString =
    // remote connection 
    | `${CapsulePrefix}${User}${Host}:${Port}/${CapsuleName}/${Endpoint}` // localhost:2423/<capsule-name>


export function parseCapsuleUrl(input: string): CapsuleConnectionRequest {
    let normalized = input.trim()

    const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalized)

    // ---- LOCAL SHORTHAND ----
    if (!hasScheme) {
        // omega
        // omega/repl
        // omega:shell
        const [namePart, endpointPart] = normalized.split(/[/:]/)

        const endpoint =
            normalized.includes(":") || normalized.includes("/")
                ? normalized.split(/[/:]/)[1]
                : "shell"

        normalized = `capsule://localhost:2423/${namePart}/${endpoint}`
    }

    const url = new URL(normalized)

    if (url.protocol !== "capsule:") {
        throw new Error(`Invalid protocol "${url.protocol}". Expected capsule://`)
    }

    const segments = url.pathname.split("/").filter(Boolean)

    if (!segments[0]) {
        throw new Error("Missing capsule name")
    }

    const [capsuleName, endpoint = "shell"] = segments

    const out = {
        username: url.username || undefined,
        password: url.password || undefined,
        host: url.hostname || "localhost",
        port: url.port || "2423",
        capsuleName,
        endpoint: endpoint as Endpoint,
    }

    console.log(out)

    return out
}

export type CapsuleConnectionRequest = {
    username?: Username
    password?: Password
    host: Host
    port: Port
    capsuleName: CapsuleName
    endpoint: Endpoint
}


function _example() {
    const connString = "capsule://localhost:2423/capsulename/shell" as ConnectionString

    const thing = parseCapsuleUrl(connString)
}