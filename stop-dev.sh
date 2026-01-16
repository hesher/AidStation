#!/bin/bash

# AidStation Development Server Stop Script
# This script stops all running services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$PROJECT_ROOT/.pids"

# Ports used by AidStation services
API_PORT=3001
WEB_PORT=3000

# Function to kill process on a specific port
kill_port() {
    local port=$1
    local name=$2
    local pids=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        echo -e "  ${GREEN}✓ Killed orphan process(es) on port $port ($name)${NC}"
        return 0
    fi
    return 1
}

echo -e "${YELLOW}Stopping AidStation services...${NC}"

# Stop Node.js processes by PID
if [ -f "$PID_DIR/api.pid" ]; then
    pid=$(cat "$PID_DIR/api.pid")
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        echo -e "  ${GREEN}✓ API server stopped${NC}"
    fi
    rm -f "$PID_DIR/api.pid"
fi

if [ -f "$PID_DIR/web.pid" ]; then
    pid=$(cat "$PID_DIR/web.pid")
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        echo -e "  ${GREEN}✓ Web frontend stopped${NC}"
    fi
    rm -f "$PID_DIR/web.pid"
fi

if [ -f "$PID_DIR/worker.pid" ]; then
    pid=$(cat "$PID_DIR/worker.pid")
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        echo -e "  ${GREEN}✓ Celery worker stopped${NC}"
    fi
    rm -f "$PID_DIR/worker.pid"
fi

# Kill any orphan processes still listening on our ports
# This catches child processes, zombie processes, or processes from crashed runs
echo -e "${YELLOW}Checking for orphan processes on ports...${NC}"
sleep 1  # Give processes a moment to terminate gracefully

kill_port $API_PORT "API server" || true
kill_port $WEB_PORT "Web frontend" || true

# Also kill any stray celery workers for this project
celery_pids=$(pgrep -f "celery.*aidstation" 2>/dev/null || true)
if [ -n "$celery_pids" ]; then
    echo "$celery_pids" | xargs kill -9 2>/dev/null || true
    echo -e "  ${GREEN}✓ Killed orphan Celery worker(s)${NC}"
fi

# Optionally stop Docker containers
if [ "$1" == "--all" ] || [ "$1" == "-a" ]; then
    echo -e "${YELLOW}Stopping Docker containers...${NC}"
    cd "$PROJECT_ROOT"
    docker-compose down
    echo -e "  ${GREEN}✓ Docker containers stopped${NC}"
else
    echo -e "${YELLOW}Note: Docker containers (PostgreSQL, Redis) still running.${NC}"
    echo -e "      Use '${GREEN}./stop-dev.sh --all${NC}' to stop everything."
fi

# Clean up log files
rm -f "$PID_DIR"/*.log

echo -e "${GREEN}Done!${NC}"
