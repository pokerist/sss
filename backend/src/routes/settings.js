const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../config/logger');
const pmsService = require('../services/pmsService');

const router = express.Router();

// Configure multer for logo upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const logoPath = path.join(uploadPath, 'logos');
    
    if (!fs.existsSync(logoPath)) {
      fs.mkdirSync(logoPath, { recursive: true });
    }
    
    cb(null, logoPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'hotel-logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB for logo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for hotel logo'), false);
    }
  }
});

// Get system settings
router.get('/system', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        hotel_name, 
        hotel_logo_url, 
        admin_username,
        pms_base_url, 
        pms_api_key, 
        pms_username,
        pms_connection_status,
        created_at,
        updated_at
      FROM system_settings 
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'System settings not found' });
    }

    const settings = result.rows[0];
    
    // Don't expose sensitive data
    delete settings.pms_password_hash;

    res.json({ settings });

  } catch (error) {
    logger.error('Get system settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update system settings
router.put('/system', authenticateToken, upload.single('hotel_logo'), async (req, res) => {
  try {
    const {
      hotel_name,
      admin_username,
      admin_password,
      pms_base_url,
      pms_api_key,
      pms_username,
      pms_password
    } = req.body;

    // Get current settings
    const currentResult = await query('SELECT * FROM system_settings LIMIT 1');
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'System settings not found' });
    }

    const currentSettings = currentResult.rows[0];

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (hotel_name !== undefined) {
      paramCount++;
      updates.push(`hotel_name = $${paramCount}`);
      params.push(hotel_name);
    }

    if (admin_username !== undefined) {
      paramCount++;
      updates.push(`admin_username = $${paramCount}`);
      params.push(admin_username);
    }

    // Handle admin password update
    if (admin_password) {
      if (admin_password.length < 6) {
        return res.status(400).json({ error: 'Admin password must be at least 6 characters long' });
      }
      
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(admin_password, saltRounds);
      
      paramCount++;
      updates.push(`admin_password_hash = $${paramCount}`);
      params.push(hashedPassword);
    }

    // Handle logo upload
    if (req.file) {
      // Get server base URL
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('host');
      const baseUrl = `${protocol}://${host}`;

      // Delete old logo if exists
      if (currentSettings.hotel_logo_url) {
        // Extract relative path from URL for file deletion
        const relativePath = currentSettings.hotel_logo_url.replace(/^https?:\/\/[^\/]+/, '');
        const oldLogoPath = path.join(process.env.UPLOAD_PATH || './uploads', relativePath);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }
      
      paramCount++;
      updates.push(`hotel_logo_url = $${paramCount}`);
      params.push(`${baseUrl}/uploads/logos/${req.file.filename}`);
    }

    // Handle PMS settings
    if (pms_base_url !== undefined) {
      paramCount++;
      updates.push(`pms_base_url = $${paramCount}`);
      params.push(pms_base_url);
    }

    if (pms_api_key !== undefined) {
      paramCount++;
      updates.push(`pms_api_key = $${paramCount}`);
      params.push(pms_api_key);
    }

    if (pms_username !== undefined) {
      paramCount++;
      updates.push(`pms_username = $${paramCount}`);
      params.push(pms_username);
    }

    if (pms_password) {
      const saltRounds = 10;
      const hashedPmsPassword = await bcrypt.hash(pms_password, saltRounds);
      
      paramCount++;
      updates.push(`pms_password_hash = $${paramCount}`);
      params.push(hashedPmsPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add updated_at
    updates.push('updated_at = NOW()');

    const updateQuery = `
      UPDATE system_settings 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING hotel_name, hotel_logo_url, admin_username, pms_base_url, pms_api_key, pms_username, pms_connection_status, updated_at
    `;
    params.push(currentSettings.id);

    const result = await query(updateQuery, params);
    const updatedSettings = result.rows[0];

    logger.info('System settings updated');

    // If PMS settings were updated, reinitialize PMS service
    if (pms_base_url !== undefined || pms_api_key !== undefined || 
        pms_username !== undefined || pms_password) {
      try {
        await pmsService.updateConfiguration();
        logger.info('PMS service configuration updated');
      } catch (error) {
        logger.warn('Failed to update PMS service configuration:', error);
      }
    }

    res.json({
      success: true,
      settings: updatedSettings
    });

  } catch (error) {
    logger.error('Update system settings error:', error);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test PMS connection
router.post('/test-pms-connection', authenticateToken, async (req, res) => {
  try {
    const { pms_base_url, pms_api_key, pms_username, pms_password } = req.body;

    if (!pms_base_url || !pms_api_key || !pms_username || !pms_password) {
      return res.status(400).json({ 
        error: 'PMS base URL, API key, username, and password are required' 
      });
    }

    // Test the connection with provided credentials
    const testResult = await pmsService.testConnection({
      pms_base_url,
      pms_api_key,
      pms_username,
      pms_password
    });

    if (testResult.success) {
      // Update connection status in database
      await query(
        'UPDATE system_settings SET pms_connection_status = $1 WHERE id = 1',
        ['connected']
      );

      logger.info('PMS connection test successful');

      res.json({
        success: true,
        message: 'PMS connection successful',
        connection_info: testResult.info
      });
    } else {
      // Update connection status in database
      await query(
        'UPDATE system_settings SET pms_connection_status = $1 WHERE id = 1',
        ['failed']
      );

      logger.warn('PMS connection test failed:', testResult.error);

      res.status(400).json({
        success: false,
        error: testResult.error,
        message: 'PMS connection failed'
      });
    }

  } catch (error) {
    logger.error('Test PMS connection error:', error);
    
    // Update connection status in database
    try {
      await query(
        'UPDATE system_settings SET pms_connection_status = $1 WHERE id = 1',
        ['error']
      );
    } catch (dbError) {
      logger.error('Failed to update PMS connection status:', dbError);
    }

    res.status(500).json({ 
      success: false,
      error: 'Internal server error during connection test' 
    });
  }
});

// Get PMS sync status
router.get('/pms-sync-status', authenticateToken, async (req, res) => {
  try {
    const syncStatus = await pmsService.getSyncStatus();
    
    res.json({
      sync_status: syncStatus
    });

  } catch (error) {
    logger.error('Get PMS sync status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Force PMS sync
router.post('/force-pms-sync', authenticateToken, async (req, res) => {
  try {
    const syncResult = await pmsService.forcSync();
    
    if (syncResult.success) {
      logger.info('Manual PMS sync completed');
      
      res.json({
        success: true,
        message: 'PMS sync completed successfully',
        sync_result: syncResult
      });
    } else {
      logger.warn('Manual PMS sync failed:', syncResult.error);
      
      res.status(400).json({
        success: false,
        error: syncResult.error,
        message: 'PMS sync failed'
      });
    }

  } catch (error) {
    logger.error('Force PMS sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize system (for first-time setup)
router.post('/initialize', async (req, res) => {
  try {
    const { hotel_name, admin_username, admin_password } = req.body;

    if (!hotel_name || !admin_username || !admin_password) {
      return res.status(400).json({ 
        error: 'Hotel name, admin username, and admin password are required' 
      });
    }

    if (admin_password.length < 6) {
      return res.status(400).json({ 
        error: 'Admin password must be at least 6 characters long' 
      });
    }

    // Check if system is already initialized
    const existingResult = await query('SELECT id FROM system_settings LIMIT 1');
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'System is already initialized' });
    }

    // Hash admin password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(admin_password, saltRounds);

    // Insert initial system settings
    const result = await query(
      'INSERT INTO system_settings (hotel_name, admin_username, admin_password_hash) VALUES ($1, $2, $3) RETURNING id',
      [hotel_name, admin_username, hashedPassword]
    );

    logger.info('System initialized successfully');

    res.json({
      success: true,
      message: 'System initialized successfully',
      system_id: result.rows[0].id
    });

  } catch (error) {
    logger.error('System initialization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
