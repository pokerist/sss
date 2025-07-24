const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configuration from environment
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_MAX_SIZE = parseInt(process.env.LOG_MAX_SIZE) || 20971520; // 20MB
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES) || 5;
const LOG_DATE_PATTERN = process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Custom format for better readability
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
  winston.format.printf(({ level, message, timestamp, metadata, stack }) => {
    let log = `${timestamp} [${level.toUpperCase()}]`;
    
    // Add request ID if available
    if (metadata.requestId) {
      log += ` [${metadata.requestId}]`;
    }
    
    // Add user context if available
    if (metadata.userId) {
      log += ` [User:${metadata.userId}]`;
    }
    
    // Add component/module if available
    if (metadata.component) {
      log += ` [${metadata.component}]`;
    }
    
    log += `: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Add additional metadata
    const metaKeys = Object.keys(metadata).filter(key => 
      !['requestId', 'userId', 'component'].includes(key)
    );
    if (metaKeys.length > 0) {
      const metaData = {};
      metaKeys.forEach(key => metaData[key] = metadata[key]);
      log += `\nMetadata: ${JSON.stringify(metaData, null, 2)}`;
    }
    
    return log;
  })
);

// JSON format for structured logging
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  winston.format.json()
);

// Create transports array
const transports = [];

// File transports with rotation
transports.push(
  // Error logs - separate file for errors only
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: customFormat,
    maxsize: LOG_MAX_SIZE,
    maxFiles: LOG_MAX_FILES,
    tailable: true
  }),
  
  // Combined logs - all levels
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: customFormat,
    maxsize: LOG_MAX_SIZE,
    maxFiles: LOG_MAX_FILES,
    tailable: true
  }),
  
  // Structured JSON logs for parsing/analysis
  new winston.transports.File({
    filename: path.join(logsDir, 'structured.log'),
    format: jsonFormat,
    maxsize: LOG_MAX_SIZE,
    maxFiles: LOG_MAX_FILES,
    tailable: true
  })
);

// Console transport for development
if (NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
          format: 'HH:mm:ss'
        }),
        winston.format.printf(({ level, message, timestamp, metadata = {} }) => {
          let log = `${timestamp} ${level}`;
          
          if (metadata.component) {
            log += ` [${metadata.component}]`;
          }
          
          if (metadata.requestId) {
            log += ` [${metadata.requestId.substring(0, 8)}...]`;
          }
          
          return `${log}: ${message}`;
        })
      )
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { 
    service: 'hotel-tv-backend',
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  },
  transports,
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: LOG_MAX_SIZE,
      maxFiles: 3
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: LOG_MAX_SIZE,
      maxFiles: 3
    })
  ],
  // Exit on handled exceptions
  exitOnError: false
});

// Add request logging middleware helper
logger.requestMiddleware = (req, res, next) => {
  req.requestId = require('crypto').randomUUID();
  req.startTime = Date.now();
  
  // Log request start
  logger.info('Request started', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    component: 'http'
  });
  
  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - req.startTime;
    
    logger.info('Request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      component: 'http'
    });
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Add context helpers
logger.withContext = (context) => {
  return {
    info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
    error: (message, meta = {}) => logger.error(message, { ...context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { ...context, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { ...context, ...meta }),
    verbose: (message, meta = {}) => logger.verbose(message, { ...context, ...meta })
  };
};

// Database logger
logger.database = logger.withContext({ component: 'database' });

// WebSocket logger
logger.websocket = logger.withContext({ component: 'websocket' });

// PMS logger
logger.pms = logger.withContext({ component: 'pms' });

// Scheduler logger
logger.scheduler = logger.withContext({ component: 'scheduler' });

// Auth logger
logger.auth = logger.withContext({ component: 'auth' });

// Device logger
logger.device = logger.withContext({ component: 'device' });

// Add performance monitoring
logger.performance = {
  start: (operation) => {
    const startTime = process.hrtime.bigint();
    return {
      end: (metadata = {}) => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        logger.info(`Performance: ${operation}`, {
          operation,
          duration: `${duration.toFixed(2)}ms`,
          component: 'performance',
          ...metadata
        });
        
        return duration;
      }
    };
  }
};

// Log system startup information
logger.info('Logger initialized', {
  level: LOG_LEVEL,
  environment: NODE_ENV,
  logDirectory: logsDir,
  maxFileSize: `${(LOG_MAX_SIZE / 1024 / 1024).toFixed(1)}MB`,
  maxFiles: LOG_MAX_FILES,
  component: 'system'
});

module.exports = logger;
