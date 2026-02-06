#!/usr/bin/env node
/**
 * Node REPL script
 *
 * Starts an interactive Node.js REPL on stdin/stdout
 */
const repl = require('repl');

// Use process.stdin and process.stdout explicitly
// Non-terminal mode prevents buffering and prompt injection
repl.start({
  input: process.stdin,
  output: process.stdout,
  prompt: '',
  ignoreUndefined: true,
  terminal: false,  // Non-terminal mode for proper piping
});
