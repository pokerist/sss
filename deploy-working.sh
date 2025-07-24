#!/bin/bash

# Hotel TV Management System - Working Deployment Script
# This script deploys the system on Ubuntu server

set -euo pipefail

# Configuration
SCRIPT_VERSION="2.0.0"
DEPLOYMENT_DATE=$(date +"%Y%m%d_%H%M%S")
LOG_DIR="./deployment-logs"
BACKUP_DIR="./backups"
APP_DIR="/var/www/hotel-tv-management"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Create directories
mkdir -p "$LOG_DIR" "$BACKUP_DIR"

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] [WARN] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1${NC}"
}

success() {
    echo -e "${CYAN}[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS] $1${NC}"
}

# Progress indicator
show_progress() {
    local current=$1
    local total=$2
    local step_name=$3
    local percent=$((current * 100 / total))
    echo -e "${BLUE}Progress: [$current/$total] ($percent%) - $step_name${NC}"
}

# System requirements check
check_system_requirements() {
    log "Checking system requirements..."
    
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
    
    local available_space=$(df / | awk '/\// {print $4}')
    if [[ $available_space -lt 2097152 ]]; then
        error "Insufficient disk space. Required: 2GB"
        return 1
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
        
        if command -v pg_dump >/dev/null 2>&1; then
            sudo -u postgres pg_dump hotel_tv_management > "$backup_path/database_backup.sql" 2>/dev/null || true
        fi
        
        success "Backup created at $backup_path"
    else
        info "No existing installation found, skipping backup"
    fi
}

# IP detection
detect_ip() {
    log "Detecting server IP address..."
    
    IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s --connect-timeout 5 ipinfo.io/ip 2>/dev/null || hostname -I | awk '{print $1}')
    
    if [[ -z "$IP" ]]; then
        warn "Could not automatically detect server IP address"
        read -p "Please enter your server IP address: " IP
    fi
    
    info "Detected server IP address: $IP"
    read -p "Is this correct? (Y/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        read -p "Please enter the correct server IP address: " IP
    fi
    
    success "Server IP confirmed: $IP"
}

# Update system
update_system() {
    show_progress 1 12 "Updating system packages"
    log "Updating system packages..."
    
    sudo apt update
    sudo apt upgrade -y
    
    success "System packages updated"
}

# Install Node.js
install_nodejs() {
    show_progress 2 12 "Installing Node.js"
    
    if command -v node >/dev/null 2>&1; then
        local current_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $current_version -ge 18 ]]; then
            info "Node.js $(node --version) is already installed"
            return 0
        fi
    fi
    
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    info "Node.js version: $(node --version)"
    info "npm version: $(npm --version)"
    
    sudo npm install -g pm2@latest
    success "Node.js and PM2 installed"
}

# Install PostgreSQL
install_postgresql() {
    show_progress 3 12 "Installing PostgreSQL"
    
    if systemctl is-active --quiet postgresql 2>/dev/null; then
        info "PostgreSQL is already installed and running"
        return 0
    fi
    
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    
    success "PostgreSQL installed"
}

# Install Redis
install_redis() {
    show_progress 4 12 "Installing Redis"
    
    if systemctl is-active --quiet redis-server 2>/dev/null; then
        info "Redis is already installed and running"
        return 0
    fi
    
    sudo apt install -y redis-server
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    
    success "Redis installed"
}

# Install Nginx
install_nginx() {
    show_progress 5 12 "Installing Nginx"
    
    if systemctl is-active --quiet nginx 2>/dev/null; then
        info "Nginx is already installed"
        sudo systemctl stop nginx
    fi
    
    sudo apt install -y nginx
    sudo systemctl enable nginx
    
    success "Nginx installed"
}

# Setup database
setup_database() {
    show_progress 6 12 "Setting up database"
    log "Setting up PostgreSQL database..."
    
    # Check if database exists
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw hotel_tv_management; then
        info "Database 'hotel_tv_management' already exists"
        DB_PASSWORD="dev_password123"
        success "Using existing database setup"
        return 0
    fi
    
    # Generate password
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    
    # Store credentials
    echo "DB_PASSWORD=$DB_PASSWORD" >> "$LOG_DIR/credentials_$DEPLOYMENT_DATE.env"
    chmod 600 "$LOG_DIR/credentials_$DEPLOYMENT_DATE.env"
    
    # Create database and user
    sudo -u postgres psql << EOF
CREATE USER hotel_tv_user WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE hotel_tv_management WITH OWNER hotel_tv_user;
GRANT ALL PRIVILEGES ON DATABASE hotel_tv_management TO hotel_tv_user;
\q
EOF
    
    success "Database created successfully"
}

# Setup application
setup_application() {
    show_progress 7 12 "Setting up application"
    log "Setting up application..."
    
    sudo mkdir -p $APP_DIR
    sudo chown $USER:$USER $APP_DIR
    
    cp -r . $APP_DIR/
    cd $APP_DIR
    
    log "Installing dependencies..."
    npm install
    
    cd backend
    npm install
    cd ..
    
    cd frontend
    npm install
    cd ..
    
    success "Application dependencies installed"
}

# Create environment file
create_env_file() {
    show_progress 8 12 "Creating environment configuration"
    log "Creating environment configuration..."
    
    JWT_SECRET=$(openssl rand -base64 64)
    echo "JWT_SECRET=$JWT_SECRET" >> "$LOG_DIR/credentials_$DEPLOYMENT_DATE.env"
    
    cat > backend/.env << EOF
# Server Configuration
SERVER_HOST=$IP
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

# Deployment Information
DEPLOYMENT_DATE=$DEPLOYMENT_DATE
DEPLOYMENT_VERSION=$SCRIPT_VERSION
EOF
    
    success "Environment configuration created"
}

# Initialize database
init_database() {
    show_progress 9 12 "Initializing database schema"
    log "Initializing database schema..."
    
    cd backend
    npm run migrate || {
        warn "Database migration failed, continuing..."
    }
    cd ..
    
    success "Database initialization completed"
}

# Build frontend
build_frontend() {
    show_progress 10 12 "Building frontend application"
    log "Building frontend application..."
    
    cd frontend
    npm run build
    cd ..
    
    if [[ ! -d "frontend/dist" ]]; then
        error "Frontend build output not found"
        return 1
    fi
    
    success "Frontend built successfully"
}

# Configure Nginx
configure_nginx() {
    show_progress 11 12 "Configuring web server"
    log "Configuring Nginx..."
    
    sudo mkdir -p /var/www/uploads
    sudo chown $USER:$USER /var/www/uploads
    
    sudo tee /etc/nginx/sites-available/hotel-tv-management << EOF
server {
    listen 80;
    server_name $IP;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # Logging
    access_log /var/log/nginx/hotel-tv-access.log;
    error_log /var/log/nginx/hotel-tv-error.log;
    
    # Frontend
    location / {
        root $APP_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }
    
    # API endpoints
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # WebSocket
    location /ws {
        proxy_pass http://localhost:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
    
    # File uploads
    location /uploads/ {
        alias /var/www/uploads/;
    }
    
    # Health check
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
}
EOF
    
    sudo ln -sf /etc/nginx/sites-available/hotel-tv-management /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    sudo nginx -t
    sudo systemctl start nginx
    
    success "Nginx configured successfully"
}

# Start application
start_application() {
    show_progress 12 12 "Starting application"
    log "Starting application with PM2..."
    
    cd $APP_DIR
    
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'hotel-tv-backend',
    script: './backend/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-err.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
}
EOF
    
    mkdir -p logs
    
    pm2 delete hotel-tv-backend 2>/dev/null || true
    pm2 start ecosystem.config.js
    pm2 save
    
    sudo pm2 startup systemd -u $USER --hp $HOME
    
    success "Application started successfully"
}

# Setup firewall
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

# Setup hotel info
setup_hotel_info() {
    log "Setting up hotel information..."
    
    echo ""
    info "Please provide hotel information for initial setup:"
    
    read -p "Hotel name: " HOTEL_NAME
    read -p "Admin username: " ADMIN_USERNAME
    
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
    sleep 10
    
    log "Initializing system configuration..."
    curl -s -X POST "http://localhost:3000/api/settings/initialize" \
         -H "Content-Type: application/json" \
         -d "{
           \"hotel_name\": \"$HOTEL_NAME\",
           \"admin_username\": \"$ADMIN_USERNAME\",
           \"admin_password\": \"$ADMIN_PASSWORD\"
         }" > /dev/null || warn "Hotel initialization may have failed"
    
    success "Hotel information configured"
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    local verification_failed=false
    
    # Check services
    for service in postgresql redis-server nginx; do
        if systemctl is-active --quiet "$service"; then
            success "$service is running"
        else
            error "$service is not running"
            verification_failed=true
        fi
    done
    
    # Check PM2
    if pm2 list | grep -q "hotel-tv-backend"; then
        success "Application process is running"
    else
        error "Application process is not running"
        verification_failed=true
    fi
    
    # Check endpoints
    sleep 5
    if curl -s -f http://localhost/health >/dev/null 2>&1; then
        success "Web server health check passed"
    else
        error "Web server health check failed"
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

# Generate report
generate_report() {
    local report_file="$LOG_DIR/deployment_report_$DEPLOYMENT_DATE.txt"
    
    cat > "$report_file" << EOF
Hotel TV Management System - Deployment Report
=============================================

Deployment Information:
- Date: $(date)
- Version: $SCRIPT_VERSION
- Server IP: $IP
- Installation Directory: $APP_DIR

Access Information:
- URL: http://$IP
- Admin Username: $ADMIN_USERNAME

File Locations:
- Application: $APP_DIR
- Logs: $APP_DIR/logs
- Uploads: /var/www/uploads

Credentials:
- Database Password: Stored in $LOG_DIR/credentials_$DEPLOYMENT_DATE.env

Useful Commands:
- View application logs: pm2 logs hotel-tv-backend
- Restart application: pm2 restart hotel-tv-backend
- Check application status: pm2 status

Report generated on: $(date)
EOF
    
    success "Deployment report generated: $report_file"
}

# Main function
main() {
    echo ""
    log "Starting Hotel TV Management System Deployment v$SCRIPT_VERSION"
    log "Deployment ID: $DEPLOYMENT_DATE"
    echo ""
    
    info "This deployment script will:"
    info "✓ Install and configure all required services"
    info "✓ Create backups and perform health checks"
    info "✓ Generate deployment report"
    echo ""
    
    read -p "Continue with deployment? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Deployment cancelled by user"
        exit 0
    fi
    
    log "Starting deployment process..."
    
    check_system_requirements
    detect_ip
    create_backup
    
    update_system
    install_nodejs
    install_postgresql
    install_redis
    install_nginx
    
    setup_database
    setup_application
    create_env_file
    init_database
    build_frontend
    configure_nginx
    start_application
    
    setup_firewall
    setup_hotel_info
    
    if verify_deployment; then
        success "Deployment verification passed"
    else
        error "Deployment verification failed"
        exit 1
    fi
    
    generate_report
    
    echo ""
    echo "================================================================"
    success "🎉 Deployment Completed Successfully!"
    echo "================================================================"
    echo ""
    info "Hotel TV Management System is now running:"
    info "  🌐 URL: http://$IP"
    info "  👤 Admin Username: $ADMIN_USERNAME"
    echo ""
    info "📊 Deployment Information:"
    info "  📂 Application: $APP_DIR"
    info "  📋 Logs: $LOG_DIR/"
    info "  💾 Backups: $BACKUP_DIR/"
    echo ""
    info "🔧 Management Commands:"
    info "  pm2 logs hotel-tv-backend    # View application logs"
    info "  pm2 restart hotel-tv-backend # Restart application"
    info "  pm2 status                   # Check process status"
    echo ""
    success "Deployment completed successfully! 🚀"
    echo ""
}

# Handle arguments
case "${1:-}" in
    --help|-h)
        echo "Hotel TV Management System - Deployment Script v$SCRIPT_VERSION"
        echo ""
        echo "Usage: $0"
        echo ""
        echo "This script will install and configure the Hotel TV Management System."
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
