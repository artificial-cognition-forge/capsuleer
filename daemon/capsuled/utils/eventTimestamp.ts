let counter = 0
let lastTimestamp = Date.now()

/** Create a timestamp with sub ms sequencing. */
export function eventTimestamp() {
    let t0 = Date.now()

    if (lastTimestamp === t0) {
        counter++
    } else {
        counter = 0
    }

    return {
        ms: t0,
        seq: counter
    }
}