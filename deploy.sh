#!/bin/bash

# Hotel TV Management System - Automated Deployment Script
# This script deploys the system on Ubuntu server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

# Detect server IP address
detect_ip() {
    # Try multiple methods to get the server IP
    IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || curl -s icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')
    
    if [ -z "$IP" ]; then
        warn "Could not automatically detect server IP address"
        read -p "Please enter your server IP address: " IP
    fi
    
    echo ""
    info "Detected server IP address: $IP"
    read -p "Is this correct? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        read -p "Please enter the correct server IP address: " IP
    fi
}

# Check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        error "Please do not run this script as root"
        exit 1
    fi
}

# Update system packages
update_system() {
    log "Updating system packages..."
    sudo apt update && sudo apt upgrade -y
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js..."
    
    # Install Node.js 18.x
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Verify installation
    node_version=$(node --version)
    npm_version=$(npm --version)
    
    log "Node.js installed: $node_version"
    log "npm installed: $npm_version"
}

# Install PostgreSQL
install_postgresql() {
    log "Installing PostgreSQL..."
    
    sudo apt install -y postgresql postgresql-contrib
    
    # Start and enable PostgreSQL
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    
    log "PostgreSQL installed and started"
}

# Install Redis
install_redis() {
    log "Installing Redis..."
    
    sudo apt install -y redis-server
    
    # Configure Redis to start on boot
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    
    log "Redis installed and started"
}

# Install Nginx
install_nginx() {
    log "Installing Nginx..."
    
    sudo apt install -y nginx
    
    # Start and enable Nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
    
    log "Nginx installed and started"
}

# Install PM2
install_pm2() {
    log "Installing PM2..."
    
    sudo npm install -g pm2
    
    # Setup PM2 startup script
    sudo pm2 startup systemd -u $USER --hp $HOME
    
    log "PM2 installed"
}

# Setup database
setup_database() {
    log "Setting up PostgreSQL database..."
    
    # Generate random password
    DB_PASSWORD=$(openssl rand -base64 32)
    
    # Create database and user
    sudo -u postgres psql << EOF
CREATE USER hotel_tv_user WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE hotel_tv_management WITH OWNER hotel_tv_user;
GRANT ALL PRIVILEGES ON DATABASE hotel_tv_management TO hotel_tv_user;
\q
EOF
    
    log "Database created successfully"
    echo "Database password: $DB_PASSWORD"
}

# Clone repository and install dependencies
setup_application() {
    log "Setting up application..."
    
    # Create application directory
    APP_DIR="/var/www/hotel-tv-management"
    sudo mkdir -p $APP_DIR
    sudo chown $USER:$USER $APP_DIR
    
    # Copy current directory to app directory
    cp -r * $APP_DIR/
    cd $APP_DIR
    
    # Install root dependencies
    npm install
    
    # Install backend dependencies
    cd backend
    npm install
    cd ..
    
    # Install frontend dependencies
    cd frontend
    npm install
    cd ..
    
    log "Dependencies installed"
}

# Create environment file
create_env_file() {
    log "Creating environment configuration..."
    
    # Generate JWT secret
    JWT_SECRET=$(openssl rand -base64 64)
    
    # Create .env file
    cat > backend/.env << EOF
# Server Configuration
SERVER_HOST=$IP
PORT=3000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hotel_tv_management
DB_USER=hotel_tv_user
DB_PASSWORD=$DB_PASSWORD

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h

# Upload paths
UPLOAD_PATH=/var/www/uploads
MAX_FILE_SIZE=10485760

# PMS Configuration
PMS_SYNC_INTERVAL=300000
PMS_CONNECTION_TIMEOUT=30000

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
EOF
    
    log "Environment file created"
}

# Initialize database
init_database() {
    log "Initializing database schema..."
    
    cd backend
    npm run migrate
    cd ..
    
    log "Database schema initialized"
}

# Build frontend
build_frontend() {
    log "Building frontend application..."
    
    cd frontend
    npm run build
    cd ..
    
    log "Frontend built successfully"
}

# Configure Nginx
configure_nginx() {
    log "Configuring Nginx..."
    
    # Create uploads directory
    sudo mkdir -p /var/www/uploads
    sudo chown $USER:$USER /var/www/uploads
    
    # Create Nginx configuration
    sudo tee /etc/nginx/sites-available/hotel-tv-management << EOF
server {
    listen 80;
    server_name $IP;
    
    # Frontend
    location / {
        root /var/www/hotel-tv-management/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }
    
    # API
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
    }
    
    # WebSocket
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
    
    # Uploads
    location /uploads/ {
        alias /var/www/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
EOF
    
    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/hotel-tv-management /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test Nginx configuration
    sudo nginx -t
    
    # Reload Nginx
    sudo systemctl reload nginx
    
    log "Nginx configured successfully"
}

# Start application with PM2
start_application() {
    log "Starting application with PM2..."
    
    cd /var/www/hotel-tv-management
    
    # Create PM2 ecosystem file
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
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
EOF
    
    # Create logs directory
    mkdir -p logs
    
    # Start application
    pm2 start ecosystem.config.js
    pm2 save
    
    log "Application started successfully"
}

# Setup firewall
setup_firewall() {
    log "Configuring firewall..."
    
    sudo ufw --force enable
    sudo ufw allow ssh
    sudo ufw allow 80
    sudo ufw allow 443
    
    log "Firewall configured"
}

# Prompt for hotel details
setup_hotel_info() {
    log "Setting up hotel information..."
    
    echo ""
    info "Please provide hotel information for initial setup:"
    read -p "Hotel name: " HOTEL_NAME
    read -p "Admin username: " ADMIN_USERNAME
    
    while true; do
        read -s -p "Admin password: " ADMIN_PASSWORD
        echo
        read -s -p "Confirm admin password: " ADMIN_PASSWORD_CONFIRM
        echo
        
        if [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ]; then
            break
        else
            error "Passwords do not match. Please try again."
        fi
    done
    
    # Initialize system via API
    sleep 5  # Wait for application to start
    
    curl -X POST "http://localhost:3000/api/settings/initialize" \
         -H "Content-Type: application/json" \
         -d "{
           \"hotel_name\": \"$HOTEL_NAME\",
           \"admin_username\": \"$ADMIN_USERNAME\",
           \"admin_password\": \"$ADMIN_PASSWORD\"
         }"
    
    log "Hotel information configured"
}

# Main deployment function
main() {
    echo ""
    log "Starting Hotel TV Management System deployment..."
    echo ""
    
    # Pre-deployment checks
    check_root
    detect_ip
    
    echo ""
    info "This script will install and configure:"
    info "- Node.js 18.x"
    info "- PostgreSQL"
    info "- Redis"
    info "- Nginx"
    info "- PM2"
    info "- Hotel TV Management System"
    echo ""
    
    read -p "Continue with deployment? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "Deployment cancelled"
        exit 1
    fi
    
    # Installation steps
    update_system
    install_nodejs
    install_postgresql
    install_redis
    install_nginx
    install_pm2
    
    # Application setup
    setup_database
    setup_application
    create_env_file
    init_database
    build_frontend
    configure_nginx
    start_application
    setup_firewall
    setup_hotel_info
    
    echo ""
    log "🎉 Deployment completed successfully!"
    echo ""
    info "Hotel TV Management System is now running at:"
    info "  URL: http://$IP"
    info "  Admin Username: $ADMIN_USERNAME"
    echo ""
    info "System Information:"
    info "  Application Directory: /var/www/hotel-tv-management"
    info "  Uploads Directory: /var/www/uploads"
    info "  Logs Directory: /var/www/hotel-tv-management/logs"
    echo ""
    info "Useful Commands:"
    info "  View logs: pm2 logs hotel-tv-backend"
    info "  Restart app: pm2 restart hotel-tv-backend"
    info "  Check status: pm2 status"
    info "  Nginx logs: sudo tail -f /var/log/nginx/error.log"
    echo ""
    warn "Please save the following information securely:"
    warn "  Database Password: $DB_PASSWORD"
    warn "  JWT Secret: $JWT_SECRET"
    echo ""
    log "Deployment completed! 🚀"
}

# Run main function
main "$@"
