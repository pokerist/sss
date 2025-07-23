const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../config/logger');
const websocketService = require('../services/websocketService');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const mediaPath = path.join(uploadPath, 'media');
    
    if (!fs.existsSync(mediaPath)) {
      fs.mkdirSync(mediaPath, { recursive: true });
    }
    
    cb(null, mediaPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB default
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

// Get all media bundles
router.get('/bundles', authenticateToken, async (req, res) => {
  try {
    const bundlesResult = await query(`
      SELECT 
        mb.*,
        COUNT(mc.id) as content_count,
        COUNT(d.id) as assigned_devices_count
      FROM media_bundles mb
      LEFT JOIN media_content mc ON mb.id = mc.bundle_id
      LEFT JOIN devices d ON mb.id = d.assigned_bundle_id
      GROUP BY mb.id
      ORDER BY mb.created_at DESC
    `);

    const bundles = await Promise.all(
      bundlesResult.rows.map(async (bundle) => {
        // Get content breakdown
        const contentResult = await query(`
          SELECT 
            type,
            COUNT(*) as count
          FROM media_content 
          WHERE bundle_id = $1 
          GROUP BY type
        `, [bundle.id]);

        const contentBreakdown = {};
        contentResult.rows.forEach(row => {
          contentBreakdown[row.type] = parseInt(row.count);
        });

        return {
          ...bundle,
          content_count: parseInt(bundle.content_count),
          assigned_devices_count: parseInt(bundle.assigned_devices_count),
          content_breakdown: contentBreakdown
        };
      })
    );

    res.json({ bundles });

  } catch (error) {
    logger.error('Get media bundles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bundle content
router.get('/bundles/:id/content', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const contentResult = await query(`
      SELECT * FROM media_content 
      WHERE bundle_id = $1 
      ORDER BY order_index ASC, created_at ASC
    `, [id]);

    res.json({ content: contentResult.rows });

  } catch (error) {
    logger.error('Get bundle content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new media bundle
router.post('/bundles', authenticateToken, async (req, res) => {
  try {
    const { name, is_default = false } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Bundle name is required' });
    }

    // If setting as default, unset other defaults
    if (is_default) {
      await query('UPDATE media_bundles SET is_default = false');
    }

    const result = await query(
      'INSERT INTO media_bundles (name, is_default) VALUES ($1, $2) RETURNING *',
      [name, is_default]
    );

    const newBundle = result.rows[0];

    logger.info(`Media bundle created: ${name}`);

    // Notify via WebSocket
    websocketService.broadcast('bundle_created', {
      bundle: newBundle,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      bundle: newBundle
    });

  } catch (error) {
    logger.error('Create media bundle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update media bundle
router.put('/bundles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, is_default } = req.body;

    // Build update query
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (name !== undefined) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      params.push(name);
    }

    if (is_default !== undefined) {
      // If setting as default, unset other defaults first
      if (is_default) {
        await query('UPDATE media_bundles SET is_default = false');
      }
      
      paramCount++;
      updates.push(`is_default = $${paramCount}`);
      params.push(is_default);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    paramCount++;
    const updateQuery = `
      UPDATE media_bundles 
      SET ${updates.join(', ')}, updated_at = NOW() 
      WHERE id = $${paramCount}
      RETURNING *
    `;
    params.push(id);

    const result = await query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    const updatedBundle = result.rows[0];

    logger.info(`Media bundle updated: ${updatedBundle.name}`);

    // Notify via WebSocket
    websocketService.broadcast('bundle_updated', {
      bundle: updatedBundle,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      bundle: updatedBundle
    });

  } catch (error) {
    logger.error('Update media bundle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete media bundle
router.delete('/bundles/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if bundle is assigned to any devices
    const assignedDevicesResult = await query(
      'SELECT COUNT(*) FROM devices WHERE assigned_bundle_id = $1',
      [id]
    );
    
    const assignedDevicesCount = parseInt(assignedDevicesResult.rows[0].count);
    if (assignedDevicesCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete bundle. It is assigned to ${assignedDevicesCount} device(s)` 
      });
    }

    // Get content files to delete
    const contentResult = await query(
      'SELECT content_url FROM media_content WHERE bundle_id = $1',
      [id]
    );

    // Delete the bundle (cascade will delete content records)
    const result = await query(
      'DELETE FROM media_bundles WHERE id = $1 RETURNING name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    const bundleName = result.rows[0].name;

    // Delete physical files
    contentResult.rows.forEach(row => {
      const filePath = path.join(process.env.UPLOAD_PATH || './uploads', row.content_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    logger.info(`Media bundle deleted: ${bundleName}`);

    // Notify via WebSocket
    websocketService.broadcast('bundle_deleted', {
      bundle_name: bundleName,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Bundle deleted successfully'
    });

  } catch (error) {
    logger.error('Delete media bundle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload media content to bundle
router.post('/bundles/:id/upload', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Verify bundle exists
    const bundleResult = await query('SELECT name FROM media_bundles WHERE id = $1', [id]);
    if (bundleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    // Get current max order index
    const maxOrderResult = await query(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM media_content WHERE bundle_id = $1',
      [id]
    );
    let currentOrder = parseInt(maxOrderResult.rows[0].max_order);

    // Insert content records
    const uploadedContent = [];
    for (const file of files) {
      currentOrder++;
      
      const type = file.mimetype.startsWith('image/') ? 'image' : 'video';
      const contentUrl = `/uploads/media/${file.filename}`;
      
      const result = await query(
        'INSERT INTO media_content (bundle_id, type, content_url, title, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, type, contentUrl, file.originalname, currentOrder]
      );
      
      uploadedContent.push(result.rows[0]);
    }

    logger.info(`${files.length} files uploaded to bundle ${id}`);

    // Notify via WebSocket
    websocketService.broadcast('content_uploaded', {
      bundle_id: id,
      content_count: files.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `${files.length} files uploaded successfully`,
      content: uploadedContent
    });

  } catch (error) {
    logger.error('Upload media error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete content from bundle
router.delete('/content/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM media_content WHERE id = $1 RETURNING content_url, title',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const deletedContent = result.rows[0];

    // Delete physical file
    const filePath = path.join(process.env.UPLOAD_PATH || './uploads', deletedContent.content_url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    logger.info(`Media content deleted: ${deletedContent.title}`);

    res.json({
      success: true,
      message: 'Content deleted successfully'
    });

  } catch (error) {
    logger.error('Delete media content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk delete bundles
router.post('/bundles/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { bundle_ids } = req.body;

    if (!bundle_ids || !Array.isArray(bundle_ids)) {
      return res.status(400).json({ error: 'bundle_ids array is required' });
    }

    // Check for assigned devices
    const assignedDevicesResult = await query(
      'SELECT COUNT(*) FROM devices WHERE assigned_bundle_id = ANY($1)',
      [bundle_ids]
    );
    
    const assignedDevicesCount = parseInt(assignedDevicesResult.rows[0].count);
    if (assignedDevicesCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete bundles. ${assignedDevicesCount} device(s) are assigned to selected bundles` 
      });
    }

    // Get content files to delete
    const contentResult = await query(
      'SELECT content_url FROM media_content WHERE bundle_id = ANY($1)',
      [bundle_ids]
    );

    // Delete bundles
    const result = await query(
      'DELETE FROM media_bundles WHERE id = ANY($1) RETURNING name',
      [bundle_ids]
    );

    // Delete physical files
    contentResult.rows.forEach(row => {
      const filePath = path.join(process.env.UPLOAD_PATH || './uploads', row.content_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    logger.info(`${result.rows.length} media bundles deleted`);

    // Notify via WebSocket
    websocketService.broadcast('bundles_bulk_deleted', {
      deleted_count: result.rows.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `${result.rows.length} bundles deleted successfully`,
      deleted_count: result.rows.length
    });

  } catch (error) {
    logger.error('Bulk delete bundles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
