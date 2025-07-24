# 🚀 Ultra-Simple One-Command Deployment

## Zero-Configuration Deployment for Ubuntu

This script handles **EVERYTHING** automatically! You just run it and confirm your IP address.

### Super Quick Start:

```bash
# 1. Make script executable
chmod +x deploy.sh

# 2. Run the fully automated deployment
./deploy.sh
```

**That's it!** The script will:
- 🔍 **Auto-detect your IP addresses** (public & local)
- ❓ **Ask you to pick one** (or use custom)
- ⚙️ **Install ALL system requirements** automatically
- 🗄️ **Setup database completely** (handles existing databases)
- 🚀 **Deploy and start your app**

## What the Script Handles Automatically:

### System Requirements:
- ✅ Updates Ubuntu packages
- ✅ Installs Node.js 18.x
- ✅ Installs PostgreSQL
- ✅ Installs Redis
- ✅ Installs PM2
- ✅ Configures firewall

### Database Setup:
- ✅ **Drops existing database** (if exists)
- ✅ Creates fresh `hotel_tv_db` database
- ✅ Creates `hotel_tv_user` with secure password
- ✅ Runs all migrations
- ✅ **Zero manual database work needed**

### Application Setup:
- ✅ Generates secure credentials
- ✅ Creates production `.env` file
- ✅ Installs all dependencies
- ✅ Builds frontend for production
- ✅ Starts with PM2
- ✅ Configures auto-startup

## User Interaction (Minimal):
The script only asks you for:
1. **Which IP to use** (auto-detected options)
2. **Port number** (defaults to 3000)

Everything else is **100% automated**!

## What's Been Removed (Zero Security):
- ❌ **No rate limiting** 
- ❌ **No CORS restrictions** 
- ❌ **No authentication requirements**
- ❌ **No IP restrictions**
- ❌ **No security blocking**

## After Deployment:
Your app will be running at: `http://YOUR_IP:3000`

**Test immediately:**
```bash
curl http://YOUR_IP:3000/api/health
```

## Management Commands:
```bash
pm2 logs hotel-tv-backend    # View logs
pm2 restart hotel-tv-backend # Restart app
pm2 status                   # Check status
```

## Perfect For:
- ✅ **Clean Ubuntu servers**
- ✅ **Users who don't want to configure anything**
- ✅ **Quick deployments anywhere**
- ✅ **Development/testing environments**

**Works on any Ubuntu server with zero technical knowledge required!** 🎉
