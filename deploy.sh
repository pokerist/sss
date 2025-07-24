#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}    Hotel TV Management System        ${NC}"
echo -e "${BLUE}      Simple Deployment Script         ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to prompt for input with default value
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local result
    
    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " result
        echo "${result:-$default}"
    else
        read -p "$prompt: " result
        echo "$result"
    fi
}

# Function to prompt for password (hidden input)
prompt_password() {
    local prompt="$1"
    local result
    
    read -s -p "$prompt: " result
    echo ""
    echo "$result"
}

echo -e "${YELLOW}This script will help you deploy the Hotel TV Management System${NC}"
echo -e "${YELLOW}All security restrictions have been removed for easy deployment!${NC}"
echo ""

# Get server information
echo -e "${GREEN}=== Server Configuration ===${NC}"
SERVER_IP=$(prompt_with_default "Enter server IP address" "0.0.0.0")
SERVER_PORT=$(prompt_with_default "Enter server port" "3000")
NODE_ENV=$(prompt_with_default "Enter environment (development/production)" "production")

echo ""
echo -e "${GREEN}=== Database Configuration ===${NC}"
DB_HOST=$(prompt_with_default "Enter database host" "localhost")
DB_PORT=$(prompt_with_default "Enter database port" "5432")
DB_NAME=$(prompt_with_default "Enter database name" "hotel_tv_db")
DB_USER=$(prompt_with_default "Enter database username" "postgres")
DB_PASSWORD=$(prompt_password "Enter database password")

echo ""
echo -e "${GREEN}=== Redis Configuration ===${NC}"
REDIS_HOST=$(prompt_with_default "Enter Redis host" "localhost")
REDIS_PORT=$(prompt_with_default "Enter Redis port" "6379")
REDIS_PASSWORD=$(prompt_with_default "Enter Redis password (leave empty if none)" "")

echo ""
echo -e "${GREEN}=== Security Configuration ===${NC}"
JWT_SECRET=$(prompt_with_default "Enter JWT secret (or press enter for auto-generated)" "$(openssl rand -hex 32)")
JWT_EXPIRES=$(prompt_with_default "Enter JWT expiration time" "24h")

echo ""
echo -e "${GREEN}=== Optional Features ===${NC}"
UPLOAD_PATH=$(prompt_with_default "Enter upload directory path" "./uploads")

# Create .env file
echo ""
echo -e "${YELLOW}Creating .env file...${NC}"

cat > backend/.env << EOF
# Server Configuration
NODE_ENV=$NODE_ENV
PORT=$SERVER_PORT
SERVER_HOST=$SERVER_IP

# Database Configuration
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Redis Configuration
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
EOF

if [ -n "$REDIS_PASSWORD" ]; then
    echo "REDIS_PASSWORD=$REDIS_PASSWORD" >> backend/.env
fi

cat >> backend/.env << EOF

# JWT Configuration
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=$JWT_EXPIRES

# Upload Configuration
UPLOAD_PATH=$UPLOAD_PATH

# Logging
LOG_LEVEL=info
EOF

echo -e "${GREEN}✅ .env file created successfully!${NC}"

# Install dependencies
echo ""
echo -e "${YELLOW}Installing backend dependencies...${NC}"
cd backend
npm install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend dependencies installed successfully!${NC}"
else
    echo -e "${RED}❌ Failed to install backend dependencies${NC}"
    exit 1
fi

cd ..

# Install frontend dependencies if frontend exists
if [ -d "frontend" ]; then
    echo ""
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Frontend dependencies installed successfully!${NC}"
        
        # Build frontend for production
        if [ "$NODE_ENV" = "production" ]; then
            echo -e "${YELLOW}Building frontend for production...${NC}"
            npm run build
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✅ Frontend built successfully!${NC}"
            else
                echo -e "${RED}❌ Failed to build frontend${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ Failed to install frontend dependencies${NC}"
    fi
    cd ..
fi

# Create uploads directory
echo ""
echo -e "${YELLOW}Creating upload directory...${NC}"
mkdir -p "$UPLOAD_PATH"
echo -e "${GREEN}✅ Upload directory created: $UPLOAD_PATH${NC}"

# Database setup prompt
echo ""
echo -e "${BLUE}=== Database Setup ===${NC}"
read -p "Do you want to run database migrations now? (y/n): " run_migrations

if [ "$run_migrations" = "y" ] || [ "$run_migrations" = "Y" ]; then
    echo -e "${YELLOW}Running database migrations...${NC}"
    cd backend
    npm run migrate
    cd ..
    echo -e "${GREEN}✅ Database migrations completed!${NC}"
fi

# PM2 setup
echo ""
echo -e "${BLUE}=== PM2 Setup ===${NC}"
read -p "Do you want to start the app with PM2? (y/n): " use_pm2

if [ "$use_pm2" = "y" ] || [ "$use_pm2" = "Y" ]; then
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}PM2 not found. Installing PM2...${NC}"
        npm install -g pm2
    fi
    
    echo -e "${YELLOW}Starting application with PM2...${NC}"
    cd backend
    pm2 stop hotel-tv-backend 2>/dev/null || true
    pm2 delete hotel-tv-backend 2>/dev/null || true
    pm2 start server.js --name hotel-tv-backend
    pm2 save
    pm2 startup
    cd ..
    
    echo -e "${GREEN}✅ Application started with PM2!${NC}"
    echo -e "${BLUE}Use 'pm2 logs hotel-tv-backend' to view logs${NC}"
    echo -e "${BLUE}Use 'pm2 restart hotel-tv-backend' to restart${NC}"
else
    echo -e "${YELLOW}You can start the application manually with:${NC}"
    echo -e "${BLUE}cd backend && npm start${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}     🚀 DEPLOYMENT COMPLETED! 🚀       ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Your application is configured to run on:${NC}"
echo -e "${YELLOW}http://$SERVER_IP:$SERVER_PORT${NC}"
echo ""
echo -e "${BLUE}Features enabled:${NC}"
echo -e "${GREEN}✅ No rate limiting${NC}"
echo -e "${GREEN}✅ No CORS restrictions${NC}"
echo -e "${GREEN}✅ Optional authentication${NC}"
echo -e "${GREEN}✅ Works on any server IP${NC}"
echo -e "${GREEN}✅ Direct API access${NC}"
echo ""
echo -e "${BLUE}Test your deployment:${NC}"
echo -e "${YELLOW}curl http://$SERVER_IP:$SERVER_PORT/api/health${NC}"
echo ""
echo -e "${BLUE}Configuration saved in:${NC}"
echo -e "${YELLOW}backend/.env${NC}"
echo ""
