#!/bin/bash
# Stop Capsuleer daemon gracefully

PID_FILE="$HOME/.capsuleer/daemon.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")

    # Try graceful termination first
    if kill -TERM "$PID" 2>/dev/null; then
        # Wait up to 5 seconds for graceful shutdown
        for i in {1..5}; do
            if ! kill -0 "$PID" 2>/dev/null; then
                # Process is gone
                rm -f "$PID_FILE"
                exit 0
            fi
            sleep 1
        done

        # If still alive, force kill
        kill -9 "$PID" 2>/dev/null || true
    fi

    rm -f "$PID_FILE"
else
    # No PID file, nothing to stop
    exit 0
fi
