#!/bin/bash

# Function to kill background processes on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $(jobs -p) 2>/dev/null
    exit
}

# Trap SIGINT (Ctrl+C)
trap cleanup SIGINT

echo "Initializing VAI System..."

# 1. Start Backend (FastAPI)
echo "------------------------------------------------"
echo "Starting Backend on http://localhost:8000"
echo "------------------------------------------------"
# running with --host 0.0.0.0 to ensure it's accessible
uv run main.py &

# 2. Start Frontend (Python HTTP Server)
echo "------------------------------------------------"
echo "Starting Frontend on http://localhost:3000"
echo "------------------------------------------------"
# Using python to serve the frontend directory
python3 -m http.server 3000 --directory frontend &

# Wait a moment to let logs appear cleanly
sleep 2

echo ""
echo "System is UP!"
echo "Open http://localhost:3000 in your browser"
echo "Logs from both services will appear below:"
echo "------------------------------------------------"

# Wait for all background processes
wait