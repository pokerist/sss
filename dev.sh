#!/bin/bash

# Hotel TV Management System - Development Environment Setup
# This script sets up and runs the development environment

set -euo pipefail

# Configuration
SCRIPT_VERSION="1.0.0"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PROJECT_ROOT/dev-logs"
DEV_LOG="$LOG_DIR/dev-$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Create logs directory
mkdir -p "$LOG_DIR"

# Logging functions
log() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[$timestamp] [INFO] $1${NC}" | tee -a "$DEV_LOG"
}

warn() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[$timestamp] [WARN] $1${NC}" | tee -a "$DEV_LOG"
}

error() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[$timestamp] [ERROR] $1${NC}" | tee -a "$DEV_LOG"
}

info() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[$timestamp] [INFO] $1${NC}" | tee -a "$DEV_LOG"
}

success() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}[$timestamp] [SUCCESS] $1${NC}" | tee -a "$DEV_LOG"
}

debug() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${PURPLE}[$timestamp] [DEBUG] $1${NC}" | tee -a "$DEV_LOG"
    fi
}

# Check if running on Windows (Git Bash, WSL, etc.)
detect_environment() {
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
        OS_TYPE="windows"
        info "Detected Windows environment (Git Bash/MSYS)"
    elif grep -q Microsoft /proc/version 2>/dev/null; then
        OS_TYPE="wsl"
        info "Detected WSL (Windows Subsystem for Linux)"
    else
        OS_TYPE="unix"
        info "Detected Unix-like environment"
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking development prerequisites..."
    
    local missing_tools=()
    
    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        missing_tools+=("Node.js")
    else
        local node_version=$(node --version | cut -d'v' -f2)
        local major_version=$(echo $node_version | cut -d'.' -f1)
        if [[ $major_version -lt 16 ]]; then
            warn "Node.js version $node_version detected. Recommended: v16 or higher"
        else
            success "Node.js version: $(node --version)"
        fi
    fi
    
    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        missing_tools+=("npm")
    else
        success "npm version: $(npm --version)"
    fi
    
    # Check if PostgreSQL is available (optional for development)
    if command -v psql >/dev/null 2>&1; then
        success "PostgreSQL client available"
    else
        warn "PostgreSQL client not found. Database features may not work."
        warn "Install PostgreSQL or use SQLite for development"
    fi
    
    # Check if Redis is available (optional for development)
    if command -v redis-cli >/dev/null 2>&1; then
        if redis-cli ping >/dev/null 2>&1; then
            success "Redis server is running"
        else
            warn "Redis client found but server is not running"
            warn "Start Redis with: redis-server (or use memory cache for development)"
        fi
    else
        warn "Redis not found. Caching features will use memory fallback."
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        error "Missing required tools: ${missing_tools[*]}"
        echo ""
        info "Installation instructions:"
        for tool in ${missing_tools[@]}; do
            case $tool in
                "Node.js")
                    info "  Node.js: https://nodejs.org/ or use nvm: https://github.com/nvm-sh/nvm"
                    ;;
                "npm")
                    info "  npm: Usually comes with Node.js installation"
                    ;;
            esac
        done
        return 1
    fi
    
    success "All required prerequisites are available"
}

# Find available port
find_available_port() {
    local base_port=$1
    local port=$base_port
    
    while [[ $port -lt $((base_port + 100)) ]]; do
        if ! lsof -i :$port >/dev/null 2>&1 && ! netstat -ln 2>/dev/null | grep -q ":$port "; then
            echo $port
            return 0
        fi
        ((port++))
    done
    
    echo $base_port  # Fallback to original port
}

# Setup development environment
setup_dev_environment() {
    log "Setting up development environment..."
    
    # Install dependencies if needed
    if [[ ! -d "node_modules" ]]; then
        log "Installing root dependencies..."
        npm install || {
            error "Failed to install root dependencies"
            return 1
        }
    fi
    
    if [[ ! -d "backend/node_modules" ]]; then
        log "Installing backend dependencies..."
        cd backend
        npm install || {
            error "Failed to install backend dependencies"
            return 1
        }
        cd ..
    fi
    
    if [[ ! -d "frontend/node_modules" ]]; then
        log "Installing frontend dependencies..."
        cd frontend
        npm install || {
            error "Failed to install frontend dependencies"
            return 1
        }
        cd ..
    fi
    
    success "Dependencies are ready"
}

# Create development environment file
create_dev_env() {
    log "Creating development environment configuration..."
    
    if [[ -f "backend/.env" && "${FORCE_ENV_RECREATE:-false}" != "true" ]]; then
        info "Development .env file already exists"
        return 0
    fi
    
    # Find available ports
    local backend_port=$(find_available_port 3000)
    local frontend_port=$(find_available_port 5173)
    
    if [[ $backend_port -ne 3000 ]]; then
        warn "Port 3000 is busy, using port $backend_port for backend"
    fi
    
    if [[ $frontend_port -ne 5173 ]]; then
        warn "Port 5173 is busy, using port $frontend_port for frontend"
    fi
    
    # Create backend .env file
    cat > backend/.env << EOF
# Development Environment Configuration
# Generated on: $(date)

# Server Configuration
SERVER_HOST=localhost
PORT=$backend_port
NODE_ENV=development

# Database Configuration (SQLite for development)
DB_TYPE=sqlite
DB_PATH=./dev-database.sqlite
# Uncomment below for PostgreSQL
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=hotel_tv_dev
# DB_USER=dev_user
# DB_PASSWORD=dev_password

# Redis Configuration (optional - will use memory cache if not available)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=false

# JWT Configuration
JWT_SECRET=dev-jwt-secret-$(openssl rand -hex 16)
JWT_EXPIRES_IN=24h

# Upload Configuration
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# PMS Configuration (disabled in development)
PMS_SYNC_INTERVAL=0
PMS_CONNECTION_TIMEOUT=5000
PMS_ENABLED=false

# Logging Configuration
LOG_LEVEL=debug
LOG_FILE=./logs/dev.log
LOG_MAX_SIZE=10485760
LOG_MAX_FILES=3
LOG_DATE_PATTERN=YYYY-MM-DD

# Development-specific settings
CORS_ORIGIN=http://localhost:$frontend_port
ENABLE_CORS=true
ENABLE_MORGAN_LOGGING=true
DEV_SEED_DATA=true

# Frontend URL (for API links)
FRONTEND_URL=http://localhost:$frontend_port
EOF
    
    # Create frontend .env file
    cat > frontend/.env.local << EOF
# Frontend Development Configuration
# Generated on: $(date)

VITE_API_URL=http://localhost:$backend_port/api
VITE_WS_URL=ws://localhost:$backend_port
VITE_APP_NAME=Hotel TV Management (Development)
VITE_NODE_ENV=development
EOF
    
    # Store ports for later use
    echo "BACKEND_PORT=$backend_port" > "$LOG_DIR/dev-ports.env"
    echo "FRONTEND_PORT=$frontend_port" >> "$LOG_DIR/dev-ports.env"
    
    success "Development environment configuration created"
    info "Backend will run on: http://localhost:$backend_port"
    info "Frontend will run on: http://localhost:$frontend_port"
}

# Setup development database
setup_dev_database() {
    log "Setting up development database..."
    
    # Create uploads directory
    mkdir -p backend/uploads
    mkdir -p backend/logs
    
    # Check if migration script exists and run it
    if [[ -f "backend/src/scripts/migrate.js" ]]; then
        log "Running database migrations..."
        cd backend
        npm run migrate 2>/dev/null || {
            warn "Migration failed or no migrate script available"
            info "Database will be initialized on first run"
        }
        cd ..
    else
        info "No migration script found, database will be initialized on first run"
    fi
    
    success "Development database setup completed"
}

# Kill existing development processes
cleanup_dev_processes() {
    info "Cleaning up existing development processes..."
    
    # Kill any existing dev processes on common ports
    for port in 3000 5173 3001 5174; do
        local pid=$(lsof -ti:$port 2>/dev/null || true)
        if [[ -n "$pid" ]]; then
            info "Killing process on port $port (PID: $pid)"
            kill $pid 2>/dev/null || true
            sleep 1
        fi
    done
    
    # Also kill any npm/node processes that might be hanging
    pkill -f "npm.*dev" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    
    success "Cleanup completed"
}

# Start development servers
start_dev_servers() {
    log "Starting development servers..."
    
    # Source the ports
    if [[ -f "$LOG_DIR/dev-ports.env" ]]; then
        source "$LOG_DIR/dev-ports.env"
    else
        BACKEND_PORT=3000
        FRONTEND_PORT=5173
    fi
    
    # Start backend in background
    log "Starting backend server on port $BACKEND_PORT..."
    cd backend
    npm run dev > "$LOG_DIR/backend-$(date +%Y%m%d_%H%M%S).log" 2>&1 &
    BACKEND_PID=$!
    cd ..
    
    # Wait a moment for backend to start
    sleep 3
    
    # Check if backend started successfully
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        error "Backend failed to start"
        cat "$LOG_DIR/backend-$(date +%Y%m%d_%H%M%S).log" | tail -20
        return 1
    fi
    
    # Test backend health
    local retries=10
    while [[ $retries -gt 0 ]]; do
        if curl -s "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
            success "Backend is running on http://localhost:$BACKEND_PORT"
            break
        fi
        ((retries--))
        if [[ $retries -eq 0 ]]; then
            warn "Backend health check failed, but continuing..."
            break
        fi
        sleep 1
    done
    
    # Start frontend in background
    log "Starting frontend server on port $FRONTEND_PORT..."
    cd frontend
    npm run dev > "$LOG_DIR/frontend-$(date +%Y%m%d_%H%M%S).log" 2>&1 &
    FRONTEND_PID=$!
    cd ..
    
    # Store PIDs for cleanup
    echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
    echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"
    
    # Wait for frontend to start
    sleep 5
    
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        error "Frontend failed to start"
        cat "$LOG_DIR/frontend-$(date +%Y%m%d_%H%M%S).log" | tail -20
        return 1
    fi
    
    success "Development servers started successfully!"
    echo ""
    info "🚀 Hotel TV Management System - Development Mode"
    info "================================================"
    info "Backend API:  http://localhost:$BACKEND_PORT"
    info "Frontend:     http://localhost:$FRONTEND_PORT"
    info "API Health:   http://localhost:$BACKEND_PORT/api/health"
    info "API Docs:     http://localhost:$BACKEND_PORT/api"
    echo ""
    info "📋 Logs:"
    info "Backend:  tail -f $LOG_DIR/backend-*.log"
    info "Frontend: tail -f $LOG_DIR/frontend-*.log"
    info "Dev Log:  tail -f $DEV_LOG"
    echo ""
    info "🛑 To stop: Ctrl+C or run: ./dev.sh --stop"
    echo ""
}

# Stop development servers
stop_dev_servers() {
    log "Stopping development servers..."
    
    local stopped=0
    
    # Stop backend
    if [[ -f "$LOG_DIR/backend.pid" ]]; then
        local backend_pid=$(cat "$LOG_DIR/backend.pid")
        if kill -0 $backend_pid 2>/dev/null; then
            kill $backend_pid
            success "Backend server stopped"
            stopped=1
        fi
        rm -f "$LOG_DIR/backend.pid"
    fi
    
    # Stop frontend
    if [[ -f "$LOG_DIR/frontend.pid" ]]; then
        local frontend_pid=$(cat "$LOG_DIR/frontend.pid")
        if kill -0 $frontend_pid 2>/dev/null; then
            kill $frontend_pid
            success "Frontend server stopped"
            stopped=1
        fi
        rm -f "$LOG_DIR/frontend.pid"
    fi
    
    # Cleanup any remaining processes
    cleanup_dev_processes
    
    if [[ $stopped -eq 1 ]]; then
        success "Development servers stopped"
    else
        info "No running development servers found"
    fi
}

# Show development status
show_dev_status() {
    log "Checking development server status..."
    
    local backend_running=false
    local frontend_running=false
    
    # Check backend
    if [[ -f "$LOG_DIR/backend.pid" ]]; then
        local backend_pid=$(cat "$LOG_DIR/backend.pid")
        if kill -0 $backend_pid 2>/dev/null; then
            success "Backend is running (PID: $backend_pid)"
            backend_running=true
        else
            warn "Backend PID file exists but process is not running"
        fi
    fi
    
    # Check frontend
    if [[ -f "$LOG_DIR/frontend.pid" ]]; then
        local frontend_pid=$(cat "$LOG_DIR/frontend.pid")
        if kill -0 $frontend_pid 2>/dev/null; then
            success "Frontend is running (PID: $frontend_pid)"
            frontend_running=true
        else
            warn "Frontend PID file exists but process is not running"
        fi
    fi
    
    if [[ $backend_running == false && $frontend_running == false ]]; then
        info "No development servers are currently running"
        info "Start with: ./dev.sh"
    fi
    
    # Show port usage
    echo ""
    info "Port usage:"
    for port in 3000 3001 5173 5174; do
        local pid=$(lsof -ti:$port 2>/dev/null || true)
        if [[ -n "$pid" ]]; then
            local process=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
            info "  Port $port: $process (PID: $pid)"
        fi
    done
    
    # Show recent logs
    echo ""
    info "Recent log files:"
    ls -la "$LOG_DIR"/*.log 2>/dev/null | tail -5 || info "No log files found"
}

# Show logs
show_logs() {
    local log_type=${1:-"all"}
    
    case $log_type in
        "backend")
            if ls "$LOG_DIR"/backend-*.log >/dev/null 2>&1; then
                tail -f "$LOG_DIR"/backend-*.log
            else
                error "No backend log files found"
            fi
            ;;
        "frontend")
            if ls "$LOG_DIR"/frontend-*.log >/dev/null 2>&1; then
                tail -f "$LOG_DIR"/frontend-*.log
            else
                error "No frontend log files found"
            fi
            ;;
        "dev")
            tail -f "$DEV_LOG"
            ;;
        "all"|*)
            info "Available logs:"
            ls -la "$LOG_DIR"/*.log 2>/dev/null || info "No log files found"
            echo ""
            info "Use: ./dev.sh --logs [backend|frontend|dev]"
            ;;
    esac
}

# Reset development environment
reset_dev_environment() {
    warn "This will reset your development environment and remove all data!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Reset cancelled"
        return 0
    fi
    
    log "Resetting development environment..."
    
    # Stop servers
    stop_dev_servers
    
    # Remove generated files
    rm -rf backend/node_modules frontend/node_modules node_modules
    rm -f backend/.env frontend/.env.local
    rm -f backend/dev-database.sqlite
    rm -rf backend/uploads backend/logs
    rm -rf "$LOG_DIR"
    
    success "Development environment reset completed"
    info "Run './dev.sh' to set up a fresh environment"
}

# Trap for cleanup on exit
cleanup_on_exit() {
    if [[ "${CLEANUP_ON_EXIT:-true}" == "true" ]]; then
        info "Cleaning up development servers..."
        stop_dev_servers
    fi
}

trap cleanup_on_exit EXIT

# Main function
main() {
    echo ""
    log "Hotel TV Management System - Development Environment v$SCRIPT_VERSION"
    echo ""
    
    detect_environment
    
    # Check prerequisites
    if ! check_prerequisites; then
        exit 1
    fi
    
    # Setup development environment
    setup_dev_environment
    create_dev_env
    setup_dev_database
    
    # Cleanup any existing processes
    cleanup_dev_processes
    
    # Start development servers
    start_dev_servers
    
    # Keep script running and show logs
    echo ""
    info "Press Ctrl+C to stop development servers"
    echo ""
    
    # Show combined logs
    if [[ "${SHOW_LOGS:-true}" == "true" ]]; then
        (tail -f "$LOG_DIR"/backend-*.log 2>/dev/null | sed 's/^/[BACKEND] /' &)
        (tail -f "$LOG_DIR"/frontend-*.log 2>/dev/null | sed 's/^/[FRONTEND] /' &)
        wait
    else
        # Just wait for interrupt
        while true; do
            sleep 1
        done
    fi
}

# Handle script arguments
case "${1:-}" in
    --setup)
        detect_environment
        check_prerequisites
        setup_dev_environment
        create_dev_env
        setup_dev_database
        success "Development environment setup completed"
        ;;
    --start)
        CLEANUP_ON_EXIT=false
        detect_environment
        check_prerequisites
        setup_dev_environment
        cleanup_dev_processes
        start_dev_servers
        ;;
    --stop)
        stop_dev_servers
        ;;
    --status)
        show_dev_status
        ;;
    --logs)
        show_logs ${2:-"all"}
        ;;
    --reset)
        reset_dev_environment
        ;;
    --no-logs)
        SHOW_LOGS=false
        main
        ;;
    --force-env)
        FORCE_ENV_RECREATE=true
        main
        ;;
    --debug)
        DEBUG=true
        main
        ;;
    --help|-h)
        echo "Hotel TV Management System - Development Environment Script v$SCRIPT_VERSION"
        echo ""
        echo "Usage: $0 [COMMAND] [OPTIONS]"
        echo ""
        echo "Commands:"
        echo "  (no args)   Start development environment with logs"
        echo "  --setup     Setup development environment only"
        echo "  --start     Start development servers (background)"
        echo "  --stop      Stop development servers"
        echo "  --status    Show development server status"
        echo "  --logs      Show logs [backend|frontend|dev|all]"
        echo "  --reset     Reset development environment"
        echo "  --help      Show this help message"
        echo ""
        echo "Options:"
        echo "  --no-logs   Start without showing logs"
        echo "  --force-env Force recreation of .env files"
        echo "  --debug     Enable debug logging"
        echo ""
        echo "Examples:"
        echo "  $0                    # Start development with logs"
        echo "  $0 --start           # Start in background"
        echo "  $0 --logs backend    # Show backend logs"
        echo "  $0 --reset           # Reset everything"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
