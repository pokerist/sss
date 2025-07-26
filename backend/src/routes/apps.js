const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

// Configure multer for APK and logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    let subPath;
    
    if (file.fieldname === 'apk') {
      subPath = 'apks';
    } else if (file.fieldname === 'logo') {
      subPath = 'logos';
    } else {
      subPath = 'apps';
    }
    
    const fullPath = path.join(uploadPath, subPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB for APK files
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'apk') {
      if (file.mimetype === 'application/vnd.android.package-archive' || 
          file.originalname.endsWith('.apk')) {
        cb(null, true);
      } else {
        cb(new Error('Only APK files are allowed for app uploads'), false);
      }
    } else if (file.fieldname === 'logo') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for logos'), false);
      }
    } else {
      cb(null, true);
    }
  }
});

// Get all apps
router.get('/', authenticateToken, async (req, res) => {
  try {
    const appsResult = await query(`
      SELECT * FROM apps 
      ORDER BY sort_order ASC, created_at ASC
    `);

    res.json({ apps: appsResult.rows });

  } catch (error) {
    logger.error('Get apps error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new app
router.post('/', authenticateToken, upload.fields([
  { name: 'apk', maxCount: 1 },
  { name: 'logo', maxCount: 1 }
]), async (req, res) => {
  try {
    const { name, package_name, is_allowed = true } = req.body;

    if (!name || !package_name) {
      return res.status(400).json({ error: 'App name and package name are required' });
    }

    // Check if package name already exists
    const existingApp = await query(
      'SELECT id FROM apps WHERE package_name = $1',
      [package_name]
    );

    if (existingApp.rows.length > 0) {
      return res.status(400).json({ error: 'Package name already exists' });
    }

    // Get max sort order
    const maxSortResult = await query('SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM apps');
    const nextSortOrder = parseInt(maxSortResult.rows[0].max_sort) + 1;

    // Handle file uploads
    let apkUrl = null;
    let logoUrl = null;

    // Get server base URL
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    if (req.files?.apk) {
      apkUrl = `${baseUrl}/uploads/apks/${req.files.apk[0].filename}`;
    }

    if (req.files?.logo) {
      logoUrl = `${baseUrl}/uploads/logos/${req.files.logo[0].filename}`;
    }

    const result = await query(
      'INSERT INTO apps (name, package_name, apk_url, app_logo_url, is_allowed, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, package_name, apkUrl, logoUrl, is_allowed, nextSortOrder]
    );

    const newApp = result.rows[0];

    logger.info(`App created: ${name} (${package_name})`);

    res.json({
      success: true,
      app: newApp
    });

  } catch (error) {
    logger.error('Create app error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      Object.values(req.files).forEach(fileArray => {
        fileArray.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update app
router.put('/:id', authenticateToken, upload.fields([
  { name: 'apk', maxCount: 1 },
  { name: 'logo', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, package_name, is_allowed, sort_order } = req.body;

    // Get current app data
    const currentAppResult = await query('SELECT * FROM apps WHERE id = $1', [id]);
    if (currentAppResult.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    const currentApp = currentAppResult.rows[0];

    // Check if package name is being changed and already exists
    if (package_name && package_name !== currentApp.package_name) {
      const existingApp = await query(
        'SELECT id FROM apps WHERE package_name = $1 AND id != $2',
        [package_name, id]
      );

      if (existingApp.rows.length > 0) {
        return res.status(400).json({ error: 'Package name already exists' });
      }
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      params.push(name);
    }

    if (package_name !== undefined) {
      paramCount++;
      updates.push(`package_name = $${paramCount}`);
      params.push(package_name);
    }

    if (is_allowed !== undefined) {
      paramCount++;
      updates.push(`is_allowed = $${paramCount}`);
      params.push(is_allowed);
    }

    if (sort_order !== undefined) {
      paramCount++;
      updates.push(`sort_order = $${paramCount}`);
      params.push(sort_order);
    }

    // Handle file uploads
    if (req.files?.apk || req.files?.logo) {
      // Get server base URL
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('host');
      const baseUrl = `${protocol}://${host}`;

      if (req.files?.apk) {
        // Delete old APK file
        if (currentApp.apk_url) {
          // Extract relative path from URL for file deletion
          const relativePath = currentApp.apk_url.replace(/^https?:\/\/[^\/]+/, '');
          const oldApkPath = path.join(process.env.UPLOAD_PATH || './uploads', relativePath);
          if (fs.existsSync(oldApkPath)) {
            fs.unlinkSync(oldApkPath);
          }
        }
        
        paramCount++;
        updates.push(`apk_url = $${paramCount}`);
        params.push(`${baseUrl}/uploads/apks/${req.files.apk[0].filename}`);
      }

      if (req.files?.logo) {
        // Delete old logo file
        if (currentApp.app_logo_url) {
          // Extract relative path from URL for file deletion
          const relativePath = currentApp.app_logo_url.replace(/^https?:\/\/[^\/]+/, '');
          const oldLogoPath = path.join(process.env.UPLOAD_PATH || './uploads', relativePath);
          if (fs.existsSync(oldLogoPath)) {
            fs.unlinkSync(oldLogoPath);
          }
        }
        
        paramCount++;
        updates.push(`app_logo_url = $${paramCount}`);
        params.push(`${baseUrl}/uploads/logos/${req.files.logo[0].filename}`);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    paramCount++;
    const updateQuery = `
      UPDATE apps 
      SET ${updates.join(', ')}, updated_at = NOW() 
      WHERE id = $${paramCount}
      RETURNING *
    `;
    params.push(id);

    const result = await query(updateQuery, params);
    const updatedApp = result.rows[0];

    logger.info(`App updated: ${updatedApp.name} (${updatedApp.package_name})`);

    res.json({
      success: true,
      app: updatedApp
    });

  } catch (error) {
    logger.error('Update app error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      Object.values(req.files).forEach(fileArray => {
        fileArray.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete app
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM apps WHERE id = $1 RETURNING name, package_name, apk_url, app_logo_url',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    const deletedApp = result.rows[0];

    // Delete physical files
    if (deletedApp.apk_url) {
      // Extract relative path from URL for file deletion
      const relativePath = deletedApp.apk_url.replace(/^https?:\/\/[^\/]+/, '');
      const apkPath = path.join(process.env.UPLOAD_PATH || './uploads', relativePath);
      if (fs.existsSync(apkPath)) {
        fs.unlinkSync(apkPath);
      }
    }

    if (deletedApp.app_logo_url) {
      // Extract relative path from URL for file deletion
      const relativePath = deletedApp.app_logo_url.replace(/^https?:\/\/[^\/]+/, '');
      const logoPath = path.join(process.env.UPLOAD_PATH || './uploads', relativePath);
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }

    logger.info(`App deleted: ${deletedApp.name} (${deletedApp.package_name})`);

    res.json({
      success: true,
      message: 'App deleted successfully'
    });

  } catch (error) {
    logger.error('Delete app error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update app sort order
router.post('/reorder', authenticateToken, async (req, res) => {
  try {
    const { app_orders } = req.body;

    if (!app_orders || !Array.isArray(app_orders)) {
      return res.status(400).json({ error: 'app_orders array is required' });
    }

    // Update sort orders in batch
    for (const { id, sort_order } of app_orders) {
      await query(
        'UPDATE apps SET sort_order = $1, updated_at = NOW() WHERE id = $2',
        [sort_order, id]
      );
    }

    logger.info(`App sort order updated for ${app_orders.length} apps`);

    res.json({
      success: true,
      message: 'App order updated successfully'
    });

  } catch (error) {
    logger.error('Reorder apps error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk delete apps
router.post('/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { app_ids } = req.body;

    if (!app_ids || !Array.isArray(app_ids)) {
      return res.status(400).json({ error: 'app_ids array is required' });
    }

    // Get app data before deletion (for file cleanup)
    const appsResult = await query(
      'SELECT apk_url, app_logo_url FROM apps WHERE id = ANY($1)',
      [app_ids]
    );

    // Delete apps
    const result = await query(
      'DELETE FROM apps WHERE id = ANY($1) RETURNING name, package_name',
      [app_ids]
    );

    // Delete physical files
    appsResult.rows.forEach(app => {
      if (app.apk_url) {
        // Extract relative path from URL for file deletion
        const relativePath = app.apk_url.replace(/^https?:\/\/[^\/]+/, '');
        const apkPath = path.join(process.env.UPLOAD_PATH || './uploads', relativePath);
        if (fs.existsSync(apkPath)) {
          fs.unlinkSync(apkPath);
        }
      }

      if (app.app_logo_url) {
        // Extract relative path from URL for file deletion
        const relativePath = app.app_logo_url.replace(/^https?:\/\/[^\/]+/, '');
        const logoPath = path.join(process.env.UPLOAD_PATH || './uploads', relativePath);
        if (fs.existsSync(logoPath)) {
          fs.unlinkSync(logoPath);
        }
      }
    });

    logger.info(`${result.rows.length} apps deleted`);

    res.json({
      success: true,
      message: `${result.rows.length} apps deleted successfully`,
      deleted_count: result.rows.length
    });

  } catch (error) {
    logger.error('Bulk delete apps error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
