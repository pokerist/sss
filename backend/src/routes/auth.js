const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Get admin credentials from database
    const result = await query(
      'SELECT id, admin_username, admin_password_hash FROM system_settings LIMIT 1'
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'System not initialized' });
    }

    const admin = result.rows[0];

    // Check username
    if (admin.admin_username !== username) {
      logger.warn(`Login attempt with invalid username: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, admin.admin_password_hash);
    if (!isPasswordValid) {
      logger.warn(`Login attempt with invalid password for username: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = generateToken(admin.id);

    logger.info(`Admin login successful: ${username}`);

    res.json({
      success: true,
      token,
      user: {
        id: admin.id,
        username: admin.admin_username
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change admin password
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get current admin data
    const result = await query(
      'SELECT id, admin_password_hash FROM system_settings LIMIT 1'
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'System not initialized' });
    }

    const admin = result.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, admin.admin_password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await query(
      'UPDATE system_settings SET admin_password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedNewPassword, admin.id]
    );

    logger.info('Admin password changed successfully');

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
