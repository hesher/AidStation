#!/bin/bash

# AidStation Development Server Startup Script
# This script starts all required services for local development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                    AidStation Dev Server                        ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is in use
port_in_use() {
    lsof -i ":$1" >/dev/null 2>&1
}

# Function to wait for a service to be ready
wait_for_service() {
    local host=$1
    local port=$2
    local name=$3
    local max_attempts=${4:-30}
    local attempt=1

    echo -ne "  Waiting for ${name} to be ready..."
    while ! nc -z "$host" "$port" 2>/dev/null; do
        if [ $attempt -ge $max_attempts ]; then
            echo -e " ${RED}TIMEOUT${NC}"
            return 1
        fi
        sleep 1
        ((attempt++))
    done
    echo -e " ${GREEN}READY${NC}"
    return 0
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists docker; then
    echo -e "  ${RED}✗ Docker is not installed${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ Docker${NC}"

if ! command_exists node; then
    echo -e "  ${RED}✗ Node.js is not installed${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ Node.js $(node --version)${NC}"

if ! command_exists npm; then
    echo -e "  ${RED}✗ npm is not installed${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ npm $(npm --version)${NC}"

if ! command_exists python3; then
    echo -e "  ${RED}✗ Python 3 is not installed${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓ Python $(python3 --version 2>&1 | cut -d' ' -f2)${NC}"

echo ""

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker Desktop first.${NC}"
    exit 1
fi

# Start infrastructure services
echo -e "${YELLOW}Starting infrastructure services...${NC}"
cd "$PROJECT_ROOT"
docker-compose up -d postgres redis
echo -e "  ${GREEN}✓ PostgreSQL and Redis containers started${NC}"

# Wait for services to be ready
wait_for_service localhost 5432 "PostgreSQL"
wait_for_service localhost 6379 "Redis"

echo ""

# Check if npm dependencies are installed
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install
    echo -e "  ${GREEN}✓ Dependencies installed${NC}"
fi

# Check if Python virtual environment exists
VENV_PATH="$PROJECT_ROOT/workers/python/venv"
if [ ! -d "$VENV_PATH" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    python3 -m venv "$VENV_PATH"
    source "$VENV_PATH/bin/activate"
    pip install --upgrade pip
    pip install -r "$PROJECT_ROOT/workers/python/requirements.txt"
    deactivate
    echo -e "  ${GREEN}✓ Python environment created${NC}"
fi

echo ""
echo -e "${YELLOW}Starting application services...${NC}"

# Create a temporary directory for PIDs
PID_DIR="$PROJECT_ROOT/.pids"
mkdir -p "$PID_DIR"

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"

    # Kill background processes
    if [ -f "$PID_DIR/api.pid" ]; then
        kill $(cat "$PID_DIR/api.pid") 2>/dev/null || true
        rm "$PID_DIR/api.pid"
    fi
    if [ -f "$PID_DIR/web.pid" ]; then
        kill $(cat "$PID_DIR/web.pid") 2>/dev/null || true
        rm "$PID_DIR/web.pid"
    fi
    if [ -f "$PID_DIR/worker.pid" ]; then
        kill $(cat "$PID_DIR/worker.pid") 2>/dev/null || true
        rm "$PID_DIR/worker.pid"
    fi

    # Stop docker services (optional - comment out to keep them running)
    # docker-compose down

    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start the Python Celery worker
echo -e "  Starting Python Celery worker..."
cd "$PROJECT_ROOT/workers/python"
source "$VENV_PATH/bin/activate"
REDIS_URL=redis://localhost:6379/0 \
DATABASE_URL=postgresql://aidstation:aidstation_dev@localhost:5432/aidstation \
celery -A src.tasks worker --loglevel=info > "$PROJECT_ROOT/.pids/worker.log" 2>&1 &
echo $! > "$PID_DIR/worker.pid"
deactivate
echo -e "  ${GREEN}✓ Celery worker started (PID: $(cat $PID_DIR/worker.pid))${NC}"

# Start the API server
echo -e "  Starting API server..."
cd "$PROJECT_ROOT/apps/api"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << EOF
DATABASE_URL=postgresql://aidstation:aidstation_dev@localhost:5432/aidstation
REDIS_URL=redis://localhost:6379/0
PORT=3001
NODE_ENV=development
OPENAI_API_KEY=your_openai_api_key_here
EOF
    echo -e "  ${YELLOW}Created .env file - please update OPENAI_API_KEY${NC}"
fi

npm run dev > "$PROJECT_ROOT/.pids/api.log" 2>&1 &
echo $! > "$PID_DIR/api.pid"
echo -e "  ${GREEN}✓ API server started (PID: $(cat $PID_DIR/api.pid))${NC}"

# Start the Web frontend
echo -e "  Starting Web frontend..."
cd "$PROJECT_ROOT/apps/web"
npm run dev > "$PROJECT_ROOT/.pids/web.log" 2>&1 &
echo $! > "$PID_DIR/web.pid"
echo -e "  ${GREEN}✓ Web frontend started (PID: $(cat $PID_DIR/web.pid))${NC}"

# Wait for services to be ready
echo ""
wait_for_service localhost 3001 "API server" 60
wait_for_service localhost 3000 "Web frontend" 60

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}                    All services are running!                     ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BLUE}Web App:${NC}      http://localhost:3000"
echo -e "  ${BLUE}API Server:${NC}   http://localhost:3001"
echo -e "  ${BLUE}PostgreSQL:${NC}   localhost:5432"
echo -e "  ${BLUE}Redis:${NC}        localhost:6379"
echo ""
echo -e "  ${YELLOW}Logs:${NC}"
echo -e "    API:    tail -f .pids/api.log"
echo -e "    Web:    tail -f .pids/web.log"
echo -e "    Worker: tail -f .pids/worker.log"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop all services"
echo ""

# Keep script running and show combined logs
cd "$PROJECT_ROOT"
tail -f .pids/api.log .pids/web.log .pids/worker.log
