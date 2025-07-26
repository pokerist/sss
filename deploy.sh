#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Exit on any error
set -e

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}    Hotel TV Management System         ${NC}"
echo -e "${BLUE}    Fully Automated Deployment         ${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}This script should not be run as root. Please run as a regular user with sudo privileges.${NC}" 
   exit 1
fi

# Auto-detect server IP
DETECTED_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "Unable to detect")
LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "127.0.0.1")

echo -e "${CYAN}🔍 Auto-detected IPs:${NC}"
echo -e "   Public IP: ${YELLOW}$DETECTED_IP${NC}"
echo -e "   Local IP:  ${YELLOW}$LOCAL_IP${NC}"
echo ""

# Ask user to confirm IP
echo -e "${GREEN}Which IP should the server use?${NC}"
echo -e "1) Public IP: $DETECTED_IP (recommended for external access)"
echo -e "2) Local IP: $LOCAL_IP (local network only)"
echo -e "3) All interfaces: 0.0.0.0 (most flexible)"
echo -e "4) Custom IP"
echo ""
read -p "Choose option (1-4) [1]: " ip_choice
ip_choice=${ip_choice:-1}

case $ip_choice in
    1) SERVER_IP="$DETECTED_IP";;
    2) SERVER_IP="$LOCAL_IP";;
    3) SERVER_IP="0.0.0.0";;
    4) read -p "Enter custom IP: " SERVER_IP;;
    *) SERVER_IP="$DETECTED_IP";;
esac

# Basic settings
read -p "Server port [3000]: " SERVER_PORT
SERVER_PORT=${SERVER_PORT:-3000}

# Generate secure credentials
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
JWT_SECRET=$(openssl rand -hex 32)

echo ""
echo -e "${YELLOW}🚀 Starting automated deployment for Ubuntu...${NC}"
echo -e "   Server IP: ${GREEN}$SERVER_IP${NC}"
echo -e "   Port: ${GREEN}$SERVER_PORT${NC}"
echo ""

# Update system
echo -e "${CYAN}📦 Updating system packages...${NC}"
sudo apt update -y && sudo apt upgrade -y

# Install system requirements
echo -e "${CYAN}📦 Installing system requirements...${NC}"

# Remove old PostgreSQL completely (optional, destructive)
echo -e "${YELLOW}Removing old PostgreSQL installations and data (if any)...${NC}"
sudo systemctl stop postgresql || true
sudo apt -y purge postgresql* || true
sudo apt -y autoremove --purge || true
sudo rm -rf /var/lib/postgresql/ || true
sudo rm -rf /etc/postgresql/ || true
sudo rm -rf /etc/postgresql-common/ || true
sudo rm -rf /var/log/postgresql/ || true
sudo rm -rf /var/run/postgresql/ || true


# Install curl and essential tools
sudo apt install -y curl wget gnupg2 software-properties-common apt-transport-https ca-certificates

# Install Node.js 18.x
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo -e "${GREEN}✅ Node.js already installed${NC}"
fi

# Install PostgreSQL
echo -e "${YELLOW}Installing fresh PostgreSQL...${NC}"
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql


# Install Redis
if ! command -v redis-server &> /dev/null; then
    echo -e "${YELLOW}Installing Redis...${NC}"
    sudo apt install -y redis-server
    sudo systemctl start redis-server
    sudo systemctl enable redis-server
else
    echo -e "${GREEN}✅ Redis already installed${NC}"
fi

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2...${NC}"
    sudo npm install -g pm2
else
    echo -e "${GREEN}✅ PM2 already installed${NC}"
fi

# Configure PostgreSQL
echo -e "${CYAN}🗄️  Configuring PostgreSQL...${NC}"

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
for i in {1..30}; do
    if sudo -u postgres psql -c '\l' &>/dev/null; then
        break
    fi
    echo "Attempt $i/30: PostgreSQL not ready yet, waiting..."
    sleep 2
done

# Configure PostgreSQL authentication
echo -e "${YELLOW}Configuring PostgreSQL authentication...${NC}"
PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" | grep -oP '\d+' | head -1)
PG_CONFIG_DIR="/etc/postgresql/$PG_VERSION/main"

# Check if PostgreSQL config directory exists
if [ ! -d "$PG_CONFIG_DIR" ]; then
    echo -e "${YELLOW}Standard config directory not found, searching for PostgreSQL config...${NC}"
    PG_CONFIG_DIR=$(find /etc/postgresql -name "main" -type d | head -1)
    if [ -z "$PG_CONFIG_DIR" ]; then
        echo -e "${RED}❌ Could not find PostgreSQL configuration directory${NC}"
        exit 1
    fi
    echo -e "${GREEN}Found PostgreSQL config at: $PG_CONFIG_DIR${NC}"
fi

# Backup original pg_hba.conf
sudo cp "$PG_CONFIG_DIR/pg_hba.conf" "$PG_CONFIG_DIR/pg_hba.conf.backup" 2>/dev/null || true

# Configure pg_hba.conf for password authentication
sudo tee "$PG_CONFIG_DIR/pg_hba.conf" > /dev/null << EOF
# PostgreSQL Client Authentication Configuration File

# TYPE  DATABASE        USER            ADDRESS                 METHOD

# "local" is for Unix domain socket connections only
local   all             postgres                                peer
local   all             all                                     md5

# IPv4 local connections:
host    all             all             127.0.0.1/32            md5
host    all             all             0.0.0.0/0               md5

# IPv6 local connections:
host    all             all             ::1/128                 md5
EOF

# Configure postgresql.conf for network connections
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONFIG_DIR/postgresql.conf" 2>/dev/null || true

# Restart PostgreSQL to apply configuration
echo -e "${YELLOW}Restarting PostgreSQL with new configuration...${NC}"
sudo systemctl restart postgresql
sleep 5

# Wait for PostgreSQL to be ready after restart
echo -e "${YELLOW}Waiting for PostgreSQL to restart...${NC}"
for i in {1..30}; do
    if sudo -u postgres psql -c '\l' &>/dev/null; then
        echo -e "${GREEN}PostgreSQL is ready!${NC}"
        break
    fi
    echo "Attempt $i/30: PostgreSQL not ready yet, waiting..."
    sleep 2
done

# Drop existing database if exists and create new one
echo -e "${YELLOW}Cleaning up existing database and user...${NC}"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS hotel_tv_db;" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS hotel_tv_user;" 2>/dev/null || true

# Escape the password properly for SQL
ESCAPED_PASSWORD=$(printf '%s\n' "$DB_PASSWORD" | sed 's/[[\.*^$()+?{|]/\\&/g')

# Create new database and user
echo -e "${YELLOW}Creating database user and database...${NC}"
sudo -u postgres psql << EOSQL
CREATE USER hotel_tv_user WITH PASSWORD '$ESCAPED_PASSWORD';
CREATE DATABASE hotel_tv_db OWNER hotel_tv_user;
GRANT ALL PRIVILEGES ON DATABASE hotel_tv_db TO hotel_tv_user;
ALTER USER hotel_tv_user CREATEDB;
\q
EOSQL

# Test the connection
echo -e "${YELLOW}Testing database connection...${NC}"
if PGPASSWORD="$DB_PASSWORD" psql -h localhost -U hotel_tv_user -d hotel_tv_db -c '\l' &>/dev/null; then
    echo -e "${GREEN}✅ Database connection test successful!${NC}"
else
    echo -e "${RED}❌ Database connection test failed!${NC}"
    echo -e "${YELLOW}Trying alternative connection method...${NC}"
    
    # Alternative: Set password using ALTER USER
    sudo -u postgres psql -c "ALTER USER hotel_tv_user WITH PASSWORD '$ESCAPED_PASSWORD';"
    
    # Test again
    if PGPASSWORD="$DB_PASSWORD" psql -h localhost -U hotel_tv_user -d hotel_tv_db -c '\l' &>/dev/null; then
        echo -e "${GREEN}✅ Database connection successful after retry!${NC}"
    else
        echo -e "${RED}❌ Database connection still failing. Check the logs for details.${NC}"
        echo -e "${YELLOW}Database Password: $DB_PASSWORD${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Database 'hotel_tv_db' created with user 'hotel_tv_user'${NC}"

# Create .env file
echo -e "${CYAN}⚙️  Creating configuration...${NC}"

cat > backend/.env << EOF
# Server Configuration
NODE_ENV=production
PORT=$SERVER_PORT
SERVER_HOST=$SERVER_IP

# Database Configuration  
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hotel_tv_db
DB_USER=hotel_tv_user
DB_PASSWORD=$DB_PASSWORD

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h

# Upload Configuration
UPLOAD_PATH=./uploads

# Logging
LOG_LEVEL=info
EOF

echo -e "${GREEN}✅ Configuration file created${NC}"

# Install dependencies
echo -e "${CYAN}📚 Installing application dependencies...${NC}"
cd backend
npm install --production
cd ..

# Build frontend if exists
if [ -d "frontend" ]; then
    echo -e "${CYAN}🎨 Building frontend...${NC}"
    cd frontend
    npm install
    npm run build
    cd ..
    echo -e "${GREEN}✅ Frontend built successfully${NC}"
fi

# Create uploads directory
mkdir -p backend/uploads
chmod 755 backend/uploads

# Run database migrations
echo -e "${CYAN}🗄️  Setting up database...${NC}"
cd backend
npm run migrate
cd ..
echo -e "${GREEN}✅ Database initialized${NC}"

# Configure firewall (allow the port)
echo -e "${CYAN}🔥 Configuring firewall...${NC}"
sudo ufw allow $SERVER_PORT/tcp
sudo ufw --force enable

# Stop any existing PM2 processes
pm2 stop hotel-tv-backend 2>/dev/null || true
pm2 delete hotel-tv-backend 2>/dev/null || true

# Start application with PM2
echo -e "${CYAN}🚀 Starting application...${NC}"
cd backend
pm2 start server.js --name hotel-tv-backend
pm2 save
pm2 startup | grep -E '^sudo ' | bash || true
cd ..

# Final health check
echo -e "${CYAN}🏥 Performing health check...${NC}"
sleep 5

if curl -f -s "http://localhost:$SERVER_PORT/api/health" > /dev/null; then
    echo -e "${GREEN}✅ Application is running successfully!${NC}"
else
    echo -e "${YELLOW}⚠️  Application started but health check failed. Check logs with: pm2 logs hotel-tv-backend${NC}"
fi

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}      🎉 DEPLOYMENT COMPLETED! 🎉       ${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "${BLUE}📋 Deployment Summary:${NC}"
echo -e "   🌐 Server URL: ${YELLOW}http://$SERVER_IP:$SERVER_PORT${NC}"
echo -e "   🗄️  Database: ${GREEN}hotel_tv_db${NC} (PostgreSQL)"
echo -e "   🔑 DB User: ${GREEN}hotel_tv_user${NC}"
echo -e "   🔒 DB Password: ${GREEN}$DB_PASSWORD${NC}"
echo -e "   🚀 Process Manager: ${GREEN}PM2${NC}"
echo ""
echo -e "${BLUE}🔧 Management Commands:${NC}"
echo -e "   View logs: ${CYAN}pm2 logs hotel-tv-backend${NC}"
echo -e "   Restart app: ${CYAN}pm2 restart hotel-tv-backend${NC}"
echo -e "   Stop app: ${CYAN}pm2 stop hotel-tv-backend${NC}"
echo -e "   App status: ${CYAN}pm2 status${NC}"
echo ""
echo -e "${BLUE}🧪 Test Your Deployment:${NC}"
echo -e "   ${CYAN}curl http://$SERVER_IP:$SERVER_PORT/api/health${NC}"
echo ""
echo -e "${GREEN}🎯 Your Hotel TV Management System is ready to use!${NC}"
echo -e "${GREEN}All security restrictions removed - works anywhere! 🎉${NC}"
echo ""
