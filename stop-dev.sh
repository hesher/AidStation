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

echo -e "${YELLOW}Stopping AidStation services...${NC}"

# Stop Node.js processes
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
