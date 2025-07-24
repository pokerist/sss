require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

// Import configurations
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const logger = require('./src/config/logger');

// Import routes
const authRoutes = require('./src/routes/auth');
const deviceRoutes = require('./src/routes/device');
const dashboardRoutes = require('./src/routes/dashboard');
const mediaRoutes = require('./src/routes/media');
const appRoutes = require('./src/routes/apps');
const settingsRoutes = require('./src/routes/settings');
const notificationRoutes = require('./src/routes/notifications');

// Import services
const pmsService = require('./src/services/pmsService');
const schedulerService = require('./src/services/schedulerService');
const websocketService = require('./src/services/websocketService');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
const HOST = process.env.SERVER_HOST || '0.0.0.0';

// Middleware - Minimal security, maximum compatibility
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Allow all origins for maximum compatibility
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
}));
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// Create upload directory if it doesn't exist
const uploadPath = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Serve static files (uploads)
app.use('/uploads', express.static(uploadPath));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/apps', appRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('./package.json').version
  });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation Error', details: err.message });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.status(500).json({ error: 'Internal Server Error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Initialize database and services
async function startServer() {
  try {
    logger.info('Starting Hotel TV Management System...');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Host: ${HOST}, Port: ${PORT}`);
    
    // Connect to database
    logger.info('Connecting to database...');
    await connectDB();
    logger.info('Database connected successfully');
    
    // Connect to Redis
    logger.info('Connecting to Redis...');
    await connectRedis();
    logger.info('Redis connected successfully');
    
    // Start HTTP server
    logger.info('Starting HTTP server...');
    const server = app.listen(PORT, HOST, () => {
      logger.info(`✅ Server running on http://${HOST}:${PORT}`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      logger.error('HTTP server error:', error);
      process.exit(1);
    });
    
    // Initialize WebSocket server
    logger.info('Initializing WebSocket server...');
    websocketService.init(server);
    logger.info('WebSocket server initialized');
    
    // Start background services
    logger.info('Initializing PMS service...');
    await pmsService.init();
    logger.info('PMS service initialized');
    
    logger.info('Starting scheduler service...');
    schedulerService.start();
    logger.info('Scheduler service started');
    
    logger.info('🚀 Hotel TV Management System started successfully!');
    
    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully`);
      
      try {
        // Stop scheduler first
        logger.info('Stopping scheduler service...');
        schedulerService.stop();
        
        // Close server
        logger.info('Closing HTTP server...');
        server.close(() => {
          logger.info('HTTP server closed');
          process.exit(0);
        });
        
        // Force exit after 30 seconds
        setTimeout(() => {
          logger.error('Forced shutdown after timeout');
          process.exit(1);
        }, 30000);
        
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    logger.error('Error stack:', error.stack);
    
    // Try to identify the specific failure point
    if (error.message.includes('Redis')) {
      logger.error('❌ Redis connection failed. Check if Redis is running and configuration is correct.');
    } else if (error.message.includes('database') || error.message.includes('PostgreSQL')) {
      logger.error('❌ Database connection failed. Check if PostgreSQL is running and configuration is correct.');
    } else if (error.message.includes('EADDRINUSE')) {
      logger.error(`❌ Port ${PORT} is already in use. Check if another instance is running.`);
    } else if (error.message.includes('EACCES')) {
      logger.error('❌ Permission denied. Check if the application has proper permissions.');
    } else {
      logger.error('❌ Unknown startup error. Check the logs above for more details.');
    }
    
    process.exit(1);
  }
}

startServer();

module.exports = app;
