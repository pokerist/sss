#!/bin/bash

# Hotel TV Management System - Development Script
# This script runs the application in development mode with enhanced logging

set -euo pipefail

# Configuration
SCRIPT_VERSION="1.0.0"
LOG_DIR="./dev-logs"
LOG_FILE="$LOG_DIR/dev_$(date +"%Y%m%d_%H%M%S").log"
BACKEND_PORT=${BACKEND_PORT:-3000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Create log directory
mkdir -p "$LOG_DIR"

# Logging functions
log() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[$timestamp] [INFO] $1${NC}"
    echo "[$timestamp] [INFO] $1" >> "$LOG_FILE"
}

warn() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[$timestamp] [WARN] $1${NC}"
    echo "[$timestamp] [WARN] $1" >> "$LOG_FILE"
}

error() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[$timestamp] [ERROR] $1${NC}"
    echo "[$timestamp] [ERROR] $1" >> "$LOG_FILE"
}

info() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[$timestamp] [INFO] $1${NC}"
    echo "[$timestamp] [INFO] $1" >> "$LOG_FILE"
}

success() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}[$timestamp] [SUCCESS] $1${NC}"
    echo "[$timestamp] [SUCCESS] $1" >> "$LOG_FILE"
}

debug() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${PURPLE}[$timestamp] [DEBUG] $1${NC}"
        echo "[$timestamp] [DEBUG] $1" >> "$LOG_FILE"
    fi
}

# Cleanup function
cleanup() {
    log "Cleaning up development processes..."
    
    # Kill background processes
    if [[ -n "${BACKEND_PID:-}" ]]; then
        kill $BACKEND_PID 2>/dev/null || true
        wait $BACKEND_PID 2>/dev/null || true
    fi
    
    if [[ -n "${FRONTEND_PID:-}" ]]; then
        kill $FRONTEND_PID 2>/dev/null || true
        wait $FRONTEND_PID 2>/dev/null || true
    fi
    
    # Kill any remaining processes on our ports
    pkill -f ":$BACKEND_PORT" 2>/dev/null || true
    pkill -f ":$FRONTEND_PORT" 2>/dev/null || true
    
    success "Development server cleanup completed"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Check prerequisites
check_prerequisites() {
    log "Checking development prerequisites..."
    
    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        error "Node.js is not installed. Please install Node.js 18 or higher."
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2)
    local major_version=$(echo $node_version | cut -d'.' -f1)
    
    if [[ $major_version -lt 18 ]]; then
        error "Node.js version $node_version is too old. Please install Node.js 18 or higher."
        exit 1
    fi
    
    success "Node.js $node_version detected"
    
    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        error "npm is not installed"
        exit 1
    fi
    
    success "npm $(npm --version) detected"
    
    # Check project structure
    if [[ ! -f "backend/package.json" ]] || [[ ! -f "frontend/package.json" ]]; then
        error "Project structure invalid. Make sure you're in the project root directory."
        exit 1
    fi
    
    success "Project structure validated"
}

# Check and cleanup ports
check_ports() {
    log "Checking port availability..."
    
    local ports_to_check=($BACKEND_PORT $FRONTEND_PORT)
    local cleanup_needed=false
    
    for port in "${ports_to_check[@]}"; do
        local pid=$(lsof -ti:$port 2>/dev/null || true)
        if [[ -n "$pid" ]]; then
            local process=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
            warn "Port $port is in use by process $process (PID: $pid)"
            
            # Ask user what to do
            read -p "Kill process on port $port? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                kill -TERM $pid 2>/dev/null || true
                sleep 2
                if kill -0 $pid 2>/dev/null; then
                    kill -KILL $pid 2>/dev/null || true
                fi
                success "Process on port $port terminated"
                cleanup_needed=true
            else
                error "Cannot start development server with port $port in use"
                exit 1
            fi
        fi
    done
    
    if [[ "$cleanup_needed" == "true" ]]; then
        info "Waiting for ports to be released..."
        sleep 2
    fi
    
    success "Port availability check completed"
}

# Setup development environment
setup_dev_env() {
    log "Setting up development environment..."
    
    # Create backend .env if it doesn't exist
    if [[ ! -f "backend/.env" ]]; then
        info "Creating development .env file..."
        cat > backend/.env << EOF
# Development Configuration
NODE_ENV=development
SERVER_HOST=localhost
PORT=$BACKEND_PORT

# Database Configuration (Update with your local settings)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hotel_tv_management
DB_USER=hotel_tv_user
DB_PASSWORD=dev_password123

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=dev_jwt_secret_$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-16)
JWT_EXPIRES_IN=24h

# Upload Configuration
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# Logging Configuration
LOG_LEVEL=debug
LOG_FILE=./logs/dev.log

# PMS Configuration
PMS_SYNC_INTERVAL=60000
PMS_CONNECTION_TIMEOUT=10000
EOF
        success "Development .env file created"
    else
        info "Using existing .env file"
    fi
    
    # Create frontend .env.local if it doesn't exist
    if [[ ! -f "frontend/.env.local" ]]; then
        info "Creating frontend development environment..."
        cat > frontend/.env.local << EOF
# Frontend Development Configuration
VITE_API_URL=http://localhost:$BACKEND_PORT/api
VITE_WS_URL=ws://localhost:$BACKEND_PORT/ws
VITE_APP_NAME=Hotel TV Management (Dev)
VITE_NODE_ENV=development
EOF
        success "Frontend development environment created"
    else
        info "Using existing frontend .env.local file"
    fi
    
    # Create necessary directories
    mkdir -p backend/logs backend/uploads
    
    success "Development environment setup completed"
}

# Install dependencies
install_dependencies() {
    log "Installing/updating dependencies..."
    
    # Check if node_modules exist and are up to date
    local backend_needs_install=false
    local frontend_needs_install=false
    
    if [[ ! -d "backend/node_modules" ]] || [[ "backend/package.json" -nt "backend/node_modules" ]]; then
        backend_needs_install=true
    fi
    
    if [[ ! -d "frontend/node_modules" ]] || [[ "frontend/package.json" -nt "frontend/node_modules" ]]; then
        frontend_needs_install=true
    fi
    
    if [[ "$backend_needs_install" == "true" ]]; then
        info "Installing backend dependencies..."
        cd backend
        npm install
        cd ..
        success "Backend dependencies installed"
    else
        info "Backend dependencies are up to date"
    fi
    
    if [[ "$frontend_needs_install" == "true" ]]; then
        info "Installing frontend dependencies..."
        cd frontend
        npm install
        cd ..
        success "Frontend dependencies installed"
    else
        info "Frontend dependencies are up to date"
    fi
}

# Start database services
start_services() {
    log "Checking required services..."
    
    # Check PostgreSQL
    if ! systemctl is-active --quiet postgresql 2>/dev/null; then
        warn "PostgreSQL is not running"
        if command -v systemctl >/dev/null 2>&1; then
            read -p "Start PostgreSQL? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                sudo systemctl start postgresql
                success "PostgreSQL started"
            else
                warn "PostgreSQL not started - database functionality may not work"
            fi
        else
            warn "Cannot start PostgreSQL automatically - please start it manually"
        fi
    else
        success "PostgreSQL is running"
    fi
    
    # Check Redis
    if ! systemctl is-active --quiet redis-server 2>/dev/null; then
        warn "Redis is not running"
        if command -v systemctl >/dev/null 2>&1; then
            read -p "Start Redis? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                sudo systemctl start redis-server
                success "Redis started"
            else
                warn "Redis not started - caching functionality may not work"
            fi
        else
            warn "Cannot start Redis automatically - please start it manually"
        fi
    else
        success "Redis is running"
    fi
}

# Start backend server
start_backend() {
    log "Starting backend development server..."
    
    cd backend
    
    # Test database connection
    if ! npm run migrate >/dev/null 2>&1; then
        warn "Database migration failed - database may not be properly configured"
    fi
    
    info "Backend server starting on http://localhost:$BACKEND_PORT"
    npm run dev &
    BACKEND_PID=$!
    
    cd ..
    
    # Wait for backend to start
    local retries=30
    for i in $(seq 1 $retries); do
        if curl -s -f http://localhost:$BACKEND_PORT/api/health >/dev/null 2>&1; then
            success "Backend server is running (PID: $BACKEND_PID)"
            return 0
        fi
        debug "Waiting for backend startup: attempt $i/$retries"
        sleep 1
    done
    
    error "Backend server failed to start within 30 seconds"
    return 1
}

# Start frontend server
start_frontend() {
    log "Starting frontend development server..."
    
    cd frontend
    
    info "Frontend server starting on http://localhost:$FRONTEND_PORT"
    npm run dev &
    FRONTEND_PID=$!
    
    cd ..
    
    # Wait for frontend to start
    local retries=30
    for i in $(seq 1 $retries); do
        if curl -s -f http://localhost:$FRONTEND_PORT >/dev/null 2>&1; then
            success "Frontend server is running (PID: $FRONTEND_PID)"
            return 0
        fi
        debug "Waiting for frontend startup: attempt $i/$retries"
        sleep 1
    done
    
    error "Frontend server failed to start within 30 seconds"
    return 1
}

# Monitor servers
monitor_servers() {
    log "Development servers are running..."
    echo ""
    info "🚀 Development Environment Ready!"
    echo ""
    info "📊 Access URLs:"
    info "  🌐 Frontend: http://localhost:$FRONTEND_PORT"
    info "  🔗 Backend API: http://localhost:$BACKEND_PORT/api"
    info "  ❤️ Health Check: http://localhost:$BACKEND_PORT/api/health"
    echo ""
    info "📋 Process Information:"
    info "  Backend PID: ${BACKEND_PID:-'Not started'}"
    info "  Frontend PID: ${FRONTEND_PID:-'Not started'}"
    echo ""
    info "📝 Logs:"
    info "  Development Log: $LOG_FILE"
    info "  Backend Logs: backend/logs/"
    echo ""
    info "🛑 To stop servers: Press Ctrl+C"
    echo ""
    
    # Monitor processes
    while true; do
        # Check if backend is still running
        if [[ -n "${BACKEND_PID:-}" ]] && ! kill -0 $BACKEND_PID 2>/dev/null; then
            error "Backend server stopped unexpectedly"
            break
        fi
        
        # Check if frontend is still running
        if [[ -n "${FRONTEND_PID:-}" ]] && ! kill -0 $FRONTEND_PID 2>/dev/null; then
            error "Frontend server stopped unexpectedly"
            break
        fi
        
        sleep 5
    done
}

# Show help
show_help() {
    echo "Hotel TV Management System - Development Script v$SCRIPT_VERSION"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --backend-only     Start only the backend server"
    echo "  --frontend-only    Start only the frontend server"
    echo "  --backend-port N   Set backend port (default: 3000)"
    echo "  --frontend-port N  Set frontend port (default: 5173)"
    echo "  --debug           Enable debug logging"
    echo "  --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Start both frontend and backend"
    echo "  $0 --backend-only           # Start only backend"
    echo "  $0 --frontend-port 3001     # Use port 3001 for frontend"
    echo "  $0 --debug                  # Enable debug output"
    echo ""
    echo "Environment Variables:"
    echo "  BACKEND_PORT      Backend server port (default: 3000)"
    echo "  FRONTEND_PORT     Frontend server port (default: 5173)"
    echo "  DEBUG             Enable debug logging (true/false)"
    echo ""
}

# Main function
main() {
    local backend_only=false
    local frontend_only=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backend-only)
                backend_only=true
                shift
                ;;
            --frontend-only)
                frontend_only=true
                shift
                ;;
            --backend-port)
                BACKEND_PORT="$2"
                shift 2
                ;;
            --frontend-port)
                FRONTEND_PORT="$2"
                shift 2
                ;;
            --debug)
                DEBUG=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Validate exclusive options
    if [[ "$backend_only" == "true" && "$frontend_only" == "true" ]]; then
        error "Cannot use --backend-only and --frontend-only together"
        exit 1
    fi
    
    echo ""
    log "Starting Hotel TV Management System Development Environment v$SCRIPT_VERSION"
    echo ""
    
    # Setup
    check_prerequisites
    check_ports
    setup_dev_env
    install_dependencies
    start_services
    
    # Start servers based on options
    if [[ "$frontend_only" != "true" ]]; then
        start_backend
    fi
    
    if [[ "$backend_only" != "true" ]]; then
        start_frontend
    fi
    
    # Monitor
    monitor_servers
}

# Handle arguments
main "$@"
