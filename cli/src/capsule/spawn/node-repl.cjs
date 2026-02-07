#!/usr/bin/env node

const repl = require("repl");

(async () => {
  const scope = await import("./test.js");  // dynamic import allowed inside async

  const r = repl.start({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
    ignoreUndefined: true,
    terminal: true
 });

  Object.assign(r.context, scope);
})();
