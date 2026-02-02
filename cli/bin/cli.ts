#!/usr/bin/env bun

import { deamon } from "cli/src/deamon/deamon"

/** Thin orchistrator layer for the cli interface. */
const cli = {
    deamon: deamon,

    capsule: {
        async list() { },
        async start() { },
        async stop() { },
    },

    ssh: {
        async list() { },
    },

    log: {
        async list() { },
    },

    async help() {
        console.log("help")
    },
}


function main() {
    // get args

    switch () {
        // do thing
    }
}

main()