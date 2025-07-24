# Simple Deployment Guide

## What We've Removed:
✅ All rate limiting (express-rate-limit package removed)
✅ Strict CORS restrictions (now allows all origins)
✅ Most security headers restrictions  
✅ Mandatory authentication (API works with or without tokens)
✅ IP address restrictions

## Quick Deployment Steps:

### 1. On Your Server:
```bash
# Clone/upload your code
git clone <your-repo> && cd <project-directory>

# Install dependencies (this will skip the removed express-rate-limit)
cd backend && npm install

# Copy environment file
cp .env.example .env

# Edit .env with your database details
nano .env
```

### 2. Minimal .env Configuration:
```bash
# Database (required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hotel_tv_db
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Redis (required) 
REDIS_HOST=localhost
REDIS_PORT=6379

# Server settings
PORT=3000
NODE_ENV=production

# JWT (optional - has fallback)
JWT_SECRET=any-random-string-here
```

### 3. Start with PM2:
```bash
pm2 start server.js --name hotel-tv-backend
pm2 logs hotel-tv-backend
```

## The App Now:
- ✅ Works on any IP address (0.0.0.0)
- ✅ Accepts requests from any domain
- ✅ No rate limiting or security blocking
- ✅ API endpoints work without authentication 
- ✅ Frontend can connect from anywhere
- ✅ Direct database access through API

## API Access:
All endpoints now work without authentication:
- `GET /api/health` - Check if running
- `GET /api/device` - List devices  
- `POST /api/device/sync` - Device sync (unlimited)
- `GET /api/dashboard` - Dashboard data
- And all other endpoints...

Authentication is completely optional now!
