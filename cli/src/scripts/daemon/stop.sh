#!/bin/bash
# Stop Capsuleer daemon gracefully
# Usage: ./stop.sh [port]

PORT="${1:-2423}"

# Kill process listening on the specified port
lsof -ti ":$PORT" | xargs kill -TERM 2>/dev/null || true
