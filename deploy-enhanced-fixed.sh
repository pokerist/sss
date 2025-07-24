#!/bin/bash

# Hotel TV Management System - Enhanced Deployment Script
# This script deploys the system on Ubuntu server with comprehensive error handling
# Version 3.0.0 - Addresses all deployment issues discovered during troubleshooting

set -euo pipefail

# Configuration
SCRIPT_VERSION="3.0.0"
DEPLOYMENT_DATE=$(date +"%Y%m%d_%H%M%S")
LOG_DIR="./deployment-logs"
LOG_FILE="$LOG_DIR/deployment_${DEPLOYMENT_DATE}.log"
ERROR_LOG="$LOG_DIR/deployment_errors_${DEPLOYMENT_DATE}.log"
BACKUP_DIR="./backups"
APP_DIR="/var/www/hotel-tv-management"
LOCKFILE="/tmp/hotel-tv-deployment.lock"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Create necessary directories
mkdir -p "$LOG_DIR" "$BACKUP_DIR"

# Redirect all output to log file while also displaying on screen
exec > >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$ERROR_LOG" >&2)

# Lock mechanism to prevent concurrent deployments
acquire_lock() {
    if [ -f "$LOCKFILE" ]; then
        local lock_pid=$(cat "$LOCKFILE")
        if kill -0 "$lock_pid" 2>/dev/null; then
            error "Another deployment is already running (PID: $lock_pid)"
            exit 1
        else
            warn "Removing stale lock file"
            rm -f "$LOCKFILE"
        fi
    fi
    echo $$ > "$LOCKFILE"
}

release_lock() {
    rm -f "$LOCKFILE"
}

trap release_lock EXIT

# Enhanced logging functions
log() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${GREEN}[$timestamp] [INFO] $1${NC}"
}

warn() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${YELLOW}[$timestamp] [WARN] $1${NC}"
}

error() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${RED}[$timestamp] [ERROR] $1${NC}"
}

info() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[$timestamp] [INFO] $1${NC}"
}

debug() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${PURPLE}[$timestamp] [DEBUG] $1${NC}"
    fi
}

success() {
    local timestamp=$(date +'%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}[$timestamp] [SUCCESS] $1${NC}"
}

# Progress indicator
show_progress() {
    local current=$1
    local total=$2
    local step_name=$3
    local percent=$((current * 100 / total))
    echo -e "${BLUE}Progress: [$current/$total] ($percent%) - $step_name${NC}"
}

# Error handling with context
handle_error() {
    local exit_code=$?
    local line_number=$1
    error "Deployment failed at line $line_number with exit code $exit_code"
    error "Last command: $BASH_COMMAND"
    
    # Show recent log entries for context
    echo -e "\n${RED}Recent log entries:${NC}"
    tail -n 10 "$LOG_FILE" 2>/dev/null || echo "No log entries available"
    
    # Offer rollback if backup exists
    if [[ -d "$BACKUP_DIR/pre_deployment_$DEPLOYMENT_DATE" ]]; then
        echo -e "\n${YELLOW}A backup was created before deployment started.${NC}"
        echo -e "${YELLOW}To rollback, run: ./rollback.sh $DEPLOYMENT_DATE${NC}"
    fi
    
    cleanup_on_failure
    exit $exit_code
}

trap 'handle_error $LINENO' ERR

# Cleanup function
cleanup_on_failure() {
    warn "Cleaning up after failed deployment..."
    
    # Stop any services that might have been started
    if systemctl is-active --quiet nginx 2>/dev/null; then
        sudo systemctl stop nginx || true
    fi
    
    if command -v pm2 >/dev/null 2>&1; then
        pm2 stop all || true
        pm2 delete all || true
    fi
    
    release_lock
}

# Enhanced port conflict detection and cleanup
check_and_cleanup_ports() {
    log "Checking for port conflicts and cleaning up..."
    
    local ports_to_check=(3000 5173 80 443)
    local cleanup_needed=false
    
    for port in "${ports_to_check[@]}"; do
        local pid=$(sudo lsof -ti:$port 2>/dev/null || true)
        if [[ -n "$pid" ]]; then
            local process=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
            warn "Port $port is in use by process $process (PID: $pid)"
            
            # Only cleanup development processes, not system services
            if [[ "$process" == *"node"* || "$process" == *"vite"* || "$port" == "3000" ]]; then
                info "Cleaning up development process on port $port"
                sudo kill -TERM $pid 2>/dev/null || true
                sleep 2
                if kill -0 $pid 2>/dev/null; then
                    sudo kill -KILL $pid 2>/dev/null || true
                fi
                cleanup_needed=true
            fi
        fi
    done
    
    # Clean up any hanging PM2 processes
    if command -v pm2 >/dev/null 2>&1; then
        pm2 delete all 2>/dev/null || true
    fi
    
    # Kill any hanging development servers
    pkill -f "vite" 2>/dev/null || true
    pkill -f "npm.*dev" 2>/dev/null || true
    
    if [[ "$cleanup_needed" == "true" ]]; then
        info "Waiting for processes to cleanup..."
        sleep 3
    fi
    
    success "Port cleanup completed"
}

# System validation functions
check_system_requirements() {
    log "Checking system requirements..."
    
    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        error "Cannot determine operating system"
        return 1
    fi
    
    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        warn "This script is designed for Ubuntu. Current OS: $ID"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Check available disk space (require at least 2GB)
    local available_space=$(df / | awk '/\// {print $4}')
    if [[ $available_space -lt 2097152 ]]; then  # 2GB in KB
        error "Insufficient disk space. Required: 2GB, Available: $((available_space/1024/1024))GB"
        return 1
    fi
    
    # Check memory (require at least 1GB)
    local available_memory=$(free -m | awk '/^Mem:/ {print $2}')
    if [[ $available_memory -lt 1024 ]]; then
        warn "Low memory detected: ${available_memory}MB. Recommended: 1GB+"
    fi
    
    success "System requirements check passed"
}

# Backup existing installation
create_backup() {
    if [[ -d "$APP_DIR" ]]; then
        log "Creating backup of existing installation..."
        local backup_path="$BACKUP_DIR/pre_deployment_$DEPLOYMENT_DATE"
        
        sudo mkdir -p "$backup_path"
        sudo cp -r "$APP_DIR" "$backup_path/" 2>/dev/null || true
        
        # Backup database
        if command -v pg_dump >/dev/null 2>&1; then
            sudo -u postgres pg_dump hotel_tv_management > "$backup_path/database_backup.sql" 2>/dev/null || true
        fi
        
        # Store deployment info
        cat > "$backup_path/deployment_info.txt" << EOF
Backup Date: $(date)
Deployment Version: $SCRIPT_VERSION
Original App Directory: $APP_DIR
Backed up by: $(whoami)
EOF
        
        success "Backup created at $backup_path"
    else
        info "No existing installation found, skipping backup"
    fi
}

# Enhanced IP detection with validation
detect_ip() {
    log "Detecting server IP address..."
    
    # Try multiple methods to get IP
    local methods=(
        "curl -s --connect-timeout 5 ifconfig.me"
        "curl -s --connect-timeout 5 ipinfo.io/ip"
        "curl -s --connect-timeout 5 icanhazip.com"
        "hostname -I | awk '{print \$1}'"
        "ip route get 8.8.8.8 | awk '{print \$7; exit}'"
    )
    
    for method in "${methods[@]}"; do
        IP=$(eval $method 2>/dev/null | tr -d '[:space:]' || true)
        if [[ -n "$IP" && "$IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            break
        fi
        IP=""
    done
    
    if [[ -z "$IP" ]]; then
        warn "Could not automatically detect server IP address"
        while true; do
            read -p "Please enter your server IP address: " IP
            if [[ "$IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
                break
            else
                error "Invalid IP address format. Please try again."
            fi
        done
    fi
    
    info "Detected server IP address: $IP"
    read -p "Is this correct? (Y/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        while true; do
            read -p "Please enter the correct server IP address: " IP
            if [[ "$IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
                break
            else
                error "Invalid IP address format. Please try again."
            fi
        done
    fi
    
    success "Server IP confirmed: $IP"
}

# Service installation with health checks
install_service() {
    local service_name=$1
    local install_commands=("${@:2}")
    
    log "Installing $service_name..."
    
    for cmd in "${install_commands[@]}"; do
        debug "Executing: $cmd"
        eval $cmd
    done
    
    success "$service_name installed successfully"
}

# Health check functions
check_service_health() {
    local service_name=$1
    local max_retries=${2:-30}
    local retry_interval=${3:-2}
    
    log "Checking $service_name health..."
    
    for i in $(seq 1 $max_retries); do
        case $service_name in
            "postgresql")
                if sudo -u postgres psql -c '\l' >/dev/null 2>&1; then
                    success "$service_name is healthy"
                    return 0
                fi
                ;;
            "redis")
                if redis-cli ping | grep -q PONG 2>/dev/null; then
                    success "$service_name is healthy"
                    return 0
                fi
                ;;
            "nginx")
                if curl -s -f http://localhost/health >/dev/null 2>&1; then
                    success "$service_name is healthy"
                    return 0
                fi
                ;;
            "application")
                if curl -s -f http://localhost:3000/api/health >/dev/null 2>&1; then
                    success "$service_name is healthy"
                    return 0
                fi
                ;;
        esac
        
        if [[ $i -eq $max_retries ]]; then
            error "$service_name health check failed after $max_retries attempts"
            return 1
        fi
        
        debug "Health check attempt $i/$max_retries failed, retrying in ${retry_interval}s..."
        sleep $retry_interval
    done
}

# Update system packages
update_system() {
    show_progress 1 13 "Updating system packages"
    log "Updating system packages..."
    
    sudo apt update
    
    local upgradable=$(sudo apt list --upgradable 2>/dev/null | grep -c upgradable || true)
    if [[ $upgradable -gt 1 ]]; then
        info "$((upgradable-1)) packages can be upgraded"
        sudo apt upgrade -y
    else
        info "System is up to date"
    fi
    
    success "System packages updated"
}

# Install Node.js with version verification
install_nodejs() {
    show_progress 2 13 "Installing Node.js"
    
    if command -v node >/dev/null 2>&1; then
        local current_version=$(node --version | cut -d'v' -f2)
        local major_version=$(echo $current_version | cut -d'.' -f1)
        
        if [[ $major_version -ge 18 ]]; then
            info "Node.js $current_version is already installed"
            if ! command -v pm2 >/dev/null 2>&1; then
                sudo npm install -g pm2@latest
            fi
            return 0
        else
            warn "Node.js $current_version is outdated, upgrading to v18"
        fi
    fi
    
    install_service "Node.js" \
        "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -" \
        "sudo apt-get install -y nodejs"
    
    local node_version=$(node --version)
    local npm_version=$(npm --version)
    
    info "Node.js version: $node_version"
    info "npm version: $npm_version"
    
    sudo npm install -g pm2@latest
    success "Node.js and PM2 installed"
}

# Install and configure PostgreSQL
install_postgresql() {
    show_progress 3 13 "Installing PostgreSQL"
    
    if systemctl is-active --quiet postgresql 2>/dev/null; then
        info "PostgreSQL is already installed and running"
        return 0
    fi
    
    install_service "PostgreSQL" \
        "sudo apt install -y postgresql postgresql-contrib" \
        "sudo systemctl start postgresql" \
        "sudo systemctl enable postgresql"
    
    check_service_health "postgresql"
}

# Install and configure Redis
install_redis() {
    show_progress 4 13 "Installing Redis"
    
    if systemctl is-active --quiet redis-server 2>/dev/null; then
        info "Redis is already installed and running"
        return 0
    fi
    
    install_service "Redis" \
        "sudo apt install -y redis-server" \
        "sudo systemctl enable redis-server" \
        "sudo systemctl start redis-server"
    
    check_service_health "redis"
}

# Install and configure Nginx
install_nginx() {
    show_progress 5 13 "Installing Nginx"
    
    if systemctl is-active --quiet nginx 2>/dev/null; then
        info "Nginx is already installed and running"
        sudo systemctl stop nginx
    fi
    
    install_service "Nginx" \
        "sudo apt install -y nginx" \
        "sudo systemctl enable nginx"
}

# Enhanced database setup with proper connection testing
setup_database() {
    show_progress 6 13 "Setting up database"
    log "Setting up PostgreSQL database..."
    
    # Check if database and user already exist
    if sudo -u postgres psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw hotel_tv_management; then
        info "Database 'hotel_tv_management' already exists"
        
        # Check if user exists and try to determine password
        if sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='hotel_tv_user'" 2>/dev/null | grep -q 1; then
            info "User 'hotel_tv_user' already exists"
            
            # Try common development password first
            DB_PASSWORD="dev_password123"
            if PGPASSWORD="$DB_PASSWORD" psql -h localhost -U hotel_tv_user -d hotel_tv_management -c "SELECT 1;" >/dev/null 2>&1; then
                success "Using existing database setup with known password"
                return 0
            else
                warn "Existing user password is unknown, resetting..."
                sudo -u postgres psql -c "ALTER USER hotel_tv_user PASSWORD '$DB_PASSWORD';" || {
                    error "Failed to reset user password"
                    return 1
                }
                success "Database user password reset successfully"
                return 0
            fi
        fi
    fi
    
    # Generate secure password
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    
    # Store credentials securely
    echo "DB_PASSWORD=$DB_PASSWORD" >> "$LOG_DIR/credentials_$DEPLOYMENT_DATE.env"
    chmod 600 "$LOG_DIR/credentials_$DEPLOYMENT_DATE.env"
    
    # Create database and user
    sudo -u postgres psql << EOF || {
        error "Database setup failed"
        return 1
    }
CREATE USER hotel_tv_user WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE hotel_tv_management WITH OWNER hotel_tv_user;
GRANT ALL PRIVILEGES ON DATABASE hotel_tv_management TO hotel_tv_user;
\q
EOF
    
    # Test the connection
    if PGPASSWORD="$DB_PASSWORD" psql -h localhost -U hotel_tv_user -d hotel_tv_management -c "SELECT 1;" >/dev/null 2>&1; then
        success "Database created and connection verified"
    else
        error "Database connection test failed"
        return 1
    fi
    
    info "Database credentials stored in: $LOG_DIR/credentials_$DEPLOYMENT_DATE.env"
}

# Application setup with dependency verification
setup_application() {
    show_progress 7 13 "Setting up application"
    log "Setting up application..."
    
    sudo mkdir -p $APP_DIR
    sudo chown $USER:$USER $APP_DIR
    
    cp -r . $APP_DIR/
    cd $APP_DIR
    
    log "Installing root dependencies..."
    npm install || {
        error "Failed to install root dependencies"
        return 1
    }
    
    log "Installing backend dependencies..."
    cd backend
    npm install || {
        error "Failed to install backend dependencies"
        return 1
    }
    cd ..
    
    log "Installing frontend dependencies..."
    cd frontend
    npm install || {
        error "Failed to install frontend dependencies"
        return 1
    }
    cd ..
    
    success "Application dependencies installed"
}

# Create comprehensive environment file with proper server binding
create_env_file() {
    show_progress 8 13 "Creating environment configuration"
    log "Creating environment configuration..."
    
    JWT_SECRET=$(openssl rand -base64 64)
    echo "JWT_SECRET=$JWT_SECRET" >> "$LOG_DIR/credentials_$DEPLOYMENT_DATE.env"
    
    # IMPORTANT: Set SERVER_HOST to localhost to avoid binding issues
    cat > backend/.env << EOF
# Server Configuration
SERVER_HOST=localhost
PORT=3000
NODE_ENV=production

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hotel_tv_management
DB_USER=hotel_tv_user
DB_PASSWORD=$DB_PASSWORD

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h

# Upload Configuration
UPLOAD_PATH=/var/www/uploads
MAX_FILE_SIZE=10485760

# PMS Configuration
PMS_SYNC_INTERVAL=300000
PMS_CONNECTION_TIMEOUT=30000

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/combined.log
LOG_MAX_SIZE=20971520
LOG_MAX_FILES=5
LOG_DATE_PATTERN=YYYY-MM-DD

# Deployment Information
DEPLOYMENT_DATE=$DEPLOYMENT_DATE
DEPLOYMENT_VERSION=$SCRIPT_VERSION
PUBLIC_IP=$IP
EOF
    
    success "Environment configuration created with proper server binding"
}

# Initialize database schema
init_database() {
    show_progress 9 13 "Initializing database schema"
    log "Initializing database schema..."
    
    cd backend
    
    # Test database connection before migration
    if ! PGPASSWORD="$DB_PASSWORD" psql -h localhost -U hotel_tv_user -d hotel_tv_management -c "SELECT 1;" >/dev/null 2>&1; then
        error "Database connection failed before migration"
        return 1
    fi
    
    npm run migrate || {
        warn "Database migration failed, checking if tables exist..."
        if PGPASSWORD="$DB_PASSWORD" psql -h localhost -U hotel_tv_user -d hotel_tv_management -c "\dt" 2>/dev/null | grep -q "system_settings"; then
            info "Database tables already exist, continuing..."
        else
            error "Database migration failed and no tables found"
            return 1
        fi
    }
    cd ..
    
    success "Database schema initialized"
}

# Build frontend with optimization
build_frontend() {
    show_progress 10 13 "Building frontend application"
    log "Building frontend application..."
    
    cd frontend
    
    # Create frontend environment file with correct API URL
    cat > .env.production << EOF
VITE_API_URL=http://$IP/api
VITE_WS_URL=ws://$IP/ws
VITE_APP_NAME=Hotel TV Management
EOF
    
    npm run build || {
        error "Frontend build failed"
        return 1
    }
    cd ..
    
    if [[ ! -d "frontend/dist" ]]; then
        error "Frontend build output not found"
        return 1
    fi
    
    # Verify build contains expected files
    if [[ ! -f "frontend/dist/index.html" ]]; then
        error "Frontend build missing index.html"
        return 1
    fi
    
    success "Frontend built successfully"
}

# Configure Nginx with proper proxy settings
configure_nginx() {
    show_progress 11 13 "Configuring web server"
    log "Configuring Nginx..."
    
    sudo mkdir -p /var/www/uploads
    sudo chown $USER:$USER /var/www/uploads
    
    # Create enhanced Nginx configuration with proper proxy settings
    sudo tee /etc/nginx/sites-available/hotel-tv-management << EOF
server {
    listen 80;
    server_name $IP;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Logging
    access_log /var/log/nginx/hotel-tv-access.log;
    error_log /var/log/nginx/hotel-tv-error.log;
    
    # Frontend
    location / {
        root $APP_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API endpoints - proxy to localhost:3000
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Error handling
        proxy_intercept_errors on;
        error_page 502 503 504 = @api_error;
    }
    
    # WebSocket - proxy to localhost:3000
    location /ws {
        proxy_pass http://localhost:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # File uploads
    location /uploads/ {
        alias /var/www/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Health check
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
    
    # API error fallback
    location @api_error {
        return 503 '{"error": "API temporarily unavailable"}';
        add_header Content-Type application/json;
    }
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json
        application/xml
        image/svg+xml;
}
EOF
    
    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/hotel-tv-management /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test configuration
    sudo nginx -t || {
        error "Nginx configuration test failed"
        return 1
    }
    
    # Start Nginx
    sudo systemctl start nginx
    
    success "Nginx configured and started successfully"
}

# Start application with PM2 and proper working directory
start_application() {
    show_progress 12 13 "Starting application"
    log "Starting application with PM2..."
    
    cd $APP_DIR
    
    # Create enhanced PM2 ecosystem file with proper working directory
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'hotel-tv-backend',
    script: './server.js',
    cwd: './backend',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '$APP_DIR/logs/pm2-err.log',
    out_file: '$APP_DIR/logs/pm2-out.log',
    log_file: '$APP_DIR/logs/pm2-combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    
    // Enhanced restart strategy
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Deployment info
    deployment_date: '$DEPLOYMENT_DATE',
    deployment_version: '$SCRIPT_VERSION'
  }]
}
EOF
    
    # Create logs directory
    mkdir -p logs
    
    # Clean up any existing PM2 processes
    pm2 delete hotel-tv-backend 2>/dev/null || true
    
    # Start application
    pm2 start ecosystem.config.js || {
        error "Failed to start application with PM2"
        return 1
    }
    
    # Wait for application to start
    sleep 5
    
    # Check if application is running
    if ! pm2 list | grep -q "hotel-tv-backend.*online"; then
        error "Application failed to start properly"
        pm2 logs hotel-tv-backend --lines 20
        return 1
    fi
    
    pm2 save
    
    # Setup PM2 startup script
    sudo pm2 startup systemd -u $USER --hp $HOME --service-name pm2-$USER 2>/dev/null || true
    
    success "Application started successfully with PM2"
}

# Comprehensive deployment verification
verify_deployment() {
    show_progress 13 13 "Verifying deployment"
    log "Running comprehensive deployment verification..."
    
    local verification_failed=false
    
    # Check system services
    local services=(
        "postgresql:PostgreSQL database"
        "redis-server:Redis cache"
        "nginx:Web server"
    )
    
    for service_info in "${services[@]}"; do
        local service="${service_info%%:*}"
        local description="${service_info##*:}"
        
        if systemctl is-active --quiet "$service"; then
            success "$description is running"
        else
            error "$description is not running"
            verification_failed=true
        fi
    done
    
    # Check PM2 application
    if pm2 list | grep -q "hotel-tv-backend.*online"; then
        success "Application process is running"
    else
        error "Application process is not running"
        verification_failed=true
    fi
    
    # Check critical endpoints with retries
    local endpoints=(
        "http://localhost/health:Nginx health check"
        "http://localhost:3000/api/health:Direct API health check"
        "http://localhost/api/health:Proxied API health check"
    )
    
    for endpoint_info in "${endpoints[@]}"; do
        local endpoint="${endpoint_info%%:*}"
        local description="${endpoint_info##*:}"
        
        local retries=5
        local endpoint_success=false
        
        for i in $(seq 1 $retries); do
            if curl -s -f "$endpoint" >/dev/null 2>&1; then
                success "$description is responding"
                endpoint_success=true
                break
            fi
            if [[ $i -lt $retries ]]; then
                debug "Endpoint check retry $i/$retries for $endpoint"
                sleep 2
            fi
        done
        
        if [[ "$endpoint_success" != "true" ]]; then
            error "$description is not responding"
            verification_failed=true
        fi
    done
    
    # Test database connectivity
    if PGPASSWORD="$DB_PASSWORD" psql -h localhost -U hotel_tv_user -d hotel_tv_management -c "SELECT 1;" >/dev/null 2>&1; then
        success "Database connectivity verified"
    else
        error "Database connectivity failed"
        verification_failed=true
    fi
    
    if [[ "$verification_failed" == "true" ]]; then
        error "Deployment verification failed"
        return 1
    else
        success "All deployment verification checks passed"
        return 0
    fi
}

# Setup firewall with enhanced rules
setup_firewall() {
    log "Configuring firewall..."
    
    if ! command -v ufw >/dev/null 2>&1; then
        warn "UFW not available, skipping firewall configuration"
        return 0
    fi
    
    sudo ufw --force enable
    sudo ufw allow ssh
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    
    success "Firewall configured"
}

# Hotel information setup with validation
setup_hotel_info() {
    log "Setting up hotel information..."
    
    echo ""
    info "Please provide hotel information for initial setup:"
    
    while [[ -z "${HOTEL_NAME:-}" ]]; do
        read -p "Hotel name: " HOTEL_NAME
    done
    
    while [[ -z "${ADMIN_USERNAME:-}" ]]; do
        read -p "Admin username: " ADMIN_USERNAME
    done
    
    while true; do
        read -s -p "Admin password (minimum 8 characters): " ADMIN_PASSWORD
        echo
        if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
            error "Password must be at least 8 characters long"
            continue
        fi
        
        read -s -p "Confirm admin password: " ADMIN_PASSWORD_CONFIRM
        echo
        
        if [[ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ]]; then
            break
        else
            error "Passwords do not match. Please try again."
        fi
    done
    
    log "Waiting for application to be ready..."
    
    # Wait for application with better retry logic
    local retries=30
    local ready=false
    
    for i in $(seq 1 $retries); do
        if curl -s -f http://localhost:3000/api/health >/dev/null 2>&1; then
            ready=true
            break
        fi
        debug "Waiting for application startup: attempt $i/$retries"
        sleep 2
    done
    
    if [[ "$ready" != "true" ]]; then
        warn "Application not ready for initialization, skipping hotel setup"
        warn "You can run initialization manually later via the web interface"
        return 0
    fi
    
    log "Initializing system configuration..."
    local response=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/settings/initialize" \
         -H "Content-Type: application/json" \
         -d "{
           \"hotel_name\": \"$HOTEL_NAME\",
           \"admin_username\": \"$ADMIN_USERNAME\",
           \"admin_password\": \"$ADMIN_PASSWORD\"
         }")
    
    local http_code=$(echo "$response" | tail -n1)
    
    if [[ "$http_code" == "200" ]]; then
        success "Hotel information configured successfully"
    else
        warn "Hotel initialization returned status: $http_code - may need manual setup"
    fi
}

# Generate comprehensive deployment report
generate_report() {
    local report_file="$LOG_DIR/deployment_report_$DEPLOYMENT_DATE.txt"
    
    cat > "$report_file" << EOF
Hotel TV Management System - Enhanced Deployment Report

Deployment Information:
- Date: $(date)
- Version: $SCRIPT_VERSION
- Server IP: $IP
- Installation Directory: $APP_DIR
- Deployment ID: $DEPLOYMENT_DATE

System Information:
- OS: $(lsb_release -d | cut -f2 2>/dev/null || uname -s)
- Kernel: $(uname -r)
- Memory: $(free -h | awk '/^Mem:/ {print $2}')
- Disk Space: $(df -h / | awk '/\// {print $4}' | tail -1) available

Services Status:
$(systemctl is-active postgresql >/dev/null 2>&1 && echo "✓ PostgreSQL: Running" || echo "✗ PostgreSQL: Stopped")
$(systemctl is-active redis-server >/dev/null 2>&1 && echo "✓ Redis: Running" || echo "✗ Redis: Stopped")
$(systemctl is-active nginx >/dev/null 2>&1 && echo "✓ Nginx: Running" || echo "✗ Nginx: Stopped")
$(pm2 list 2>/dev/null | grep -q hotel-tv-backend && echo "✓ Application: Running" || echo "✗ Application: Stopped")

Access Information:
- Primary URL: http://$IP
- API Health: http://$IP/api/health
- Admin Username: ${ADMIN_USERNAME:-"Not configured"}

Important Notes:
- Server binds to localhost:3000, proxied through Nginx
- Database password stored securely in credentials file
- PM2 configured with proper working directory
- Enhanced error handling and logging enabled

File Locations:
- Application: $APP_DIR
- Logs: $APP_DIR/logs
- PM2 Logs: pm2 logs hotel-tv-backend
- Uploads: /var/www/uploads
- Nginx Config: /etc/nginx/sites-available/hotel-tv-management
- Credentials: $LOG_DIR/credentials_$DEPLOYMENT_DATE.env

Useful Commands:
- View application logs: pm2 logs hotel-tv-backend
- Restart application: pm2 restart hotel-tv-backend
- Check application status: pm2 status
- View deployment logs: tail -f $LOG_FILE
- View nginx logs: sudo tail -f /var/log/nginx/hotel-tv-error.log
- Check service status: systemctl status postgresql redis-server nginx

Troubleshooting:
- If browser shows cached error, use incognito/private mode
- Check PM2 status if application not responding
- Verify nginx proxy configuration points to localhost:3000
- Database connection uses localhost with stored credentials

Browser Cache Notice:
- After deployment, clear browser cache or use incognito mode
- The system may show cached errors from previous attempts
- Hard refresh (Ctrl+F5) may be needed

Report generated on: $(date)
EOF
    
    success "Deployment report generated: $report_file"
}

# Main deployment function
main() {
    echo ""
    log "Starting Hotel TV Management System Enhanced Deployment v$SCRIPT_VERSION"
    log "Deployment ID: $DEPLOYMENT_DATE"
    echo ""
    
    # Acquire deployment lock
    acquire_lock
    
    info "This enhanced deployment script addresses all known issues:"
    info "✓ Port conflict detection and cleanup"
    info "✓ Enhanced database connection handling"
    info "✓ Proper server binding configuration"
    info "✓ PM2 working directory fixes"
    info "✓ Comprehensive health checks"
    info "✓ Browser cache considerations"
    echo ""
    info "Installation includes:"
    info "- Node.js 18.x with PM2"
    info "- PostgreSQL database"
    info "- Redis cache server"
    info "- Nginx web server with proper proxy"
    info "- Enhanced logging and error handling"
    echo ""
    
    read -p "Continue with enhanced deployment? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Deployment cancelled by user"
        exit 0
    fi
    
    log "Starting deployment process..."
    
    # Pre-deployment checks and cleanup
    check_system_requirements
    check_and_cleanup_ports
    detect_ip
    create_backup
    
    # Install and configure services
    update_system
    install_nodejs
    install_postgresql
    install_redis
    install_nginx
    
    # Setup application
    setup_database
    setup_application
    create_env_file
    init_database
    build_frontend
    configure_nginx
    start_application
    
    # Final configuration
    setup_firewall
    
    # Verify deployment
    if verify_deployment; then
        success "Deployment verification passed"
    else
        error "Deployment verification failed - check logs for details"
        exit 1
    fi
    
    # Setup hotel information
    setup_hotel_info
    
    # Generate comprehensive report
    generate_report
    
    echo ""
    echo "================================================================"
    success "🎉 Enhanced Deployment Completed Successfully!"
    echo "================================================================"
    echo ""
    info "Hotel TV Management System is now running:"
    info "  🌐 Primary URL: http://$IP"
    info "  🔗 API Health: http://$IP/api/health"
    info "  👤 Admin Username: ${ADMIN_USERNAME:-'Configure via web interface'}"
    echo ""
    info "📊 Deployment Information:"
    info "  📅 Deployment ID: $DEPLOYMENT_DATE"
    info "  📂 Application: $APP_DIR"
    info "  📋 Logs: $LOG_DIR/"
    info "  💾 Backups: $BACKUP_DIR/"
    info "  📄 Report: $LOG_DIR/deployment_report_$DEPLOYMENT_DATE.txt"
    echo ""
    info "🔧 Management Commands:"
    info "  pm2 logs hotel-tv-backend    # View application logs"
    info "  pm2 restart hotel-tv-backend # Restart application"
    info "  pm2 status                   # Check process status"
    info "  systemctl status nginx       # Check web server"
    echo ""
    warn "🌐 Browser Cache Notice:"
    warn "  If you see errors, use incognito/private mode or clear cache"
    warn "  Hard refresh (Ctrl+F5) may be needed for first access"
    echo ""
    warn "🔐 Important: Secure your credentials file:"
    warn "  $LOG_DIR/credentials_$DEPLOYMENT_DATE.env"
    echo ""
    success "Deployment completed successfully! 🚀"
    echo ""
}

# Handle script arguments
case "${1:-}" in
    --debug)
        DEBUG=true
        main
        ;;
    --help|-h)
        echo "Hotel TV Management System - Enhanced Deployment Script v$SCRIPT_VERSION"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --debug    Enable debug logging"
        echo "  --help     Show this help message"
        echo ""
        echo "Enhanced Features:"
        echo "  ✓ Port conflict detection and cleanup"
        echo "  ✓ Enhanced database connection handling"
        echo "  ✓ Proper server binding (localhost) with Nginx proxy"
        echo "  ✓ PM2 working directory fixes"
        echo "  ✓ Comprehensive health checks and verification"
        echo "  ✓ Browser cache issue prevention"
        echo "  ✓ Detailed logging and error reporting"
        echo "  ✓ Automatic backup and rollback capability"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
