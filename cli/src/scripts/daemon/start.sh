#!/bin/bash
# Start Capsuleer daemon in background with nohup
# Usage: ./start.sh [log_file]

LOG_FILE="${1:-.capsuleer/logs/daemon.log}"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Start daemon with nohup and capture output
# Use nice to reduce CPU priority to prevent 100% CPU usage from ssh2 busy-loop
nohup nice -n 10 capsuleer daemon runtime >> "$LOG_FILE" 2>&1 &
