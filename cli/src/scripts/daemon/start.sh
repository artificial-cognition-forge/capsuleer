#!/bin/bash
# Start Capsuleer daemon in background with explicit PATH

LOG_FILE="${1:-.capsuleer/logs/daemon.log}"
mkdir -p "$(dirname "$LOG_FILE")"

source ~/.profile
nohup env \
  BUN_NO_FILE_WATCH=1 \
  SSH_AUTH_SOCK="$SSH_AUTH_SOCK" \
  PATH="$PATH" \
  nice -n 10 \
  bash -c 'exec -a capsuleerd capsuleer daemon runtime' \
  >> "$LOG_FILE" 2>&1 &