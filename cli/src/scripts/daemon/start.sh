#!/bin/bash
# Start Capsuleer daemon in background with nohup
# Usage: ./start.sh [log_file]

LOG_FILE="${1:-.capsuleer/logs/daemon.log}"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Start daemon with nohup and capture output
# BUN_NO_FILE_WATCH=1 disables Bun's file watcher which was causing 100% CPU idle usage
nohup env BUN_NO_FILE_WATCH=1 nice -n 10 \
  bash -c 'exec -a capsuleerd capsuleer daemon runtime' \
  >> "$LOG_FILE" 2>&1 &
