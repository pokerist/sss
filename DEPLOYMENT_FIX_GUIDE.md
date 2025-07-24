# Hotel TV Management System - Deployment Fix Guide

## Issue Summary
The backend application was crashing immediately after startup due to a **Redis configuration incompatibility**. The application was using Redis client v4.x but with an outdated configuration format.

## Root Cause
- Redis client v4+ requires a different connection configuration format
- The old format used separate `host` and `port` parameters
- The new format requires a `url` parameter
- Additionally, multer package was using a deprecated version

## Changes Made

### 1. Fixed Redis Configuration (`backend/src/config/redis.js`)
- ✅ Updated to use Redis v4+ compatible configuration
- ✅ Changed from `{host, port}` to `{url: 'redis://host:port'}`
- ✅ Improved reconnection strategy and error handling
- ✅ Added better event logging

### 2. Updated Dependencies (`backend/package.json`)
- ✅ Updated multer from `^1.4.5-lts.1` to `^2.0.0` to remove deprecation warnings
- ✅ All other dependencies remain compatible

### 3. Enhanced Server Startup (`backend/server.js`)
- ✅ Added detailed startup logging for better diagnostics
- ✅ Improved error handling with specific error identification
- ✅ Added graceful shutdown handling
- ✅ Better step-by-step initialization process

### 4. Added Verification Tools
- ✅ Created `verify-fix.js` script to test connections before deployment

## Deployment Steps

### Step 1: Push Changes to Repository
```bash
# In your local development directory
git add .
git commit -m "Fix Redis connection and startup issues"
git push origin main
```

### Step 2: Pull Changes on Server
```bash
# SSH to your server
ssh root@155.138.231.215

# Navigate to application directory
cd /var/www/hotel-tv-management

# Pull latest changes
git pull origin main
```

### Step 3: Install Updated Dependencies
```bash
# Navigate to backend directory
cd backend

# Install updated dependencies (including multer v2)
npm install
```

### Step 4: Verify Configuration (Optional but Recommended)
```bash
# Go back to root directory
cd ..

# Run verification script
node verify-fix.js
```

Expected output if everything is working:
```
🚀 Hotel TV Management System - Fix Verification

🔍 Testing Redis connection with new configuration...
Connecting to: redis://localhost:6379
✅ Redis client connected
✅ Redis ping successful: PONG
✅ Redis set/get test successful: test_value
✅ Redis connection test completed successfully
🔍 Testing database connection...
✅ Database connection test successful

📊 Verification Results:
Redis: ✅ PASS
Database: ✅ PASS

🎉 All tests passed! The application should start successfully.
```

### Step 5: Restart Application
```bash
# Stop the current errored process
pm2 delete hotel-tv-backend

# Start fresh (this will use the updated code)
pm2 start ecosystem.config.js

# Check status
pm2 status
```

### Step 6: Monitor Logs
```bash
# Watch real-time logs
pm2 logs hotel-tv-backend

# Or check specific log files
tail -f logs/combined.log
tail -f logs/error.log
```

Expected successful startup logs:
```
info: Starting Hotel TV Management System...
info: Environment: production
info: Host: 155.138.231.215, Port: 3000
info: Connecting to database...
info: Database connected successfully
info: Connecting to Redis...
info: Redis connected successfully
info: Starting HTTP server...
info: ✅ Server running on http://155.138.231.215:3000
info: Initializing WebSocket server...
info: WebSocket server initialized
info: Initializing PMS service...
info: PMS service initialized
info: Starting scheduler service...
info: Scheduler service started
info: 🚀 Hotel TV Management System started successfully!
```

### Step 7: Test Application
```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Should return:
# {"status":"OK","timestamp":"2025-07-24T...","uptime":...,"version":"1.0.0"}
```

### Step 8: Access Web Interface
Open your browser and navigate to:
- http://155.138.231.215

You should see the Hotel TV Management System login page.

## Troubleshooting

### If Redis Still Fails
```bash
# Check if Redis is running
systemctl status redis-server

# Start Redis if not running
systemctl start redis-server

# Test Redis manually
redis-cli ping
```

### If Database Fails
```bash
# Check PostgreSQL status
systemctl status postgresql

# Test database connection
sudo -u postgres psql -d hotel_tv_management -c "SELECT NOW();"
```

### If Port is in Use
```bash
# Check what's using port 3000
lsof -i :3000

# Kill any conflicting processes
pm2 kill
```

### Check Environment Variables
```bash
# View the .env file to ensure all variables are set
cat backend/.env

# Key variables that must be present:
# - DB_PASSWORD (should be the generated password from deployment)
# - JWT_SECRET (should be the generated secret)
# - SERVER_HOST=155.138.231.215
```

## Verification Checklist

- [ ] Code changes pulled to server
- [ ] Dependencies updated (`npm install` completed)
- [ ] Redis connection test passes
- [ ] Database connection test passes
- [ ] PM2 process shows `online` status
- [ ] No error logs in `pm2 logs`
- [ ] Health endpoint responds correctly
- [ ] Web interface loads properly

## Expected Results

After applying these fixes:
1. ✅ Application starts successfully without crashes
2. ✅ PM2 shows stable "online" status instead of "errored"
3. ✅ No more "too many unstable restarts" errors
4. ✅ Web interface loads and is accessible
5. ✅ Admin can complete hotel setup process
6. ✅ All backend services (WebSocket, PMS sync, scheduler) work properly

## Contact

If you encounter any issues during deployment, please check:
1. The PM2 logs: `pm2 logs hotel-tv-backend`
2. The application logs: `tail -f /var/www/hotel-tv-management/logs/error.log`
3. System logs: `journalctl -u pm2-root.service -f`

The main fixes address the Redis connection incompatibility which was the root cause of the startup crashes.
