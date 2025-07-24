const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../config/logger');

// Optional authentication - allows requests with or without tokens
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // If no token provided, just continue without authentication
  if (!token) {
    req.user = null; // No user authenticated
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    // Verify user still exists in database
    const result = await query(
      'SELECT id, admin_username FROM system_settings WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      req.user = null; // Invalid token, but continue anyway
      return next();
    }

    req.user = {
      id: decoded.userId,
      username: result.rows[0].admin_username
    };
    
    next();
  } catch (error) {
    logger.warn('Token verification failed, continuing without auth:', error.message);
    req.user = null; // Token invalid, but continue anyway
    next();
  }
};

// Strict authentication (for routes that absolutely need it)
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    const result = await query(
      'SELECT id, admin_username FROM system_settings WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = {
      id: decoded.userId,
      username: result.rows[0].admin_username
    };
    
    next();
  } catch (error) {
    logger.error('Token verification error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

module.exports = {
  authenticateToken,
  requireAuth,
  generateToken
};
