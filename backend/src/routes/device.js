const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { syncDevice, updateNotificationStatus, clearEvacuationStatus } = require('../controllers/deviceController');
const { set } = require('../config/redis');
const logger = require('../config/logger');

const router = express.Router();

// Device sync endpoint (public - for TV boxes)
router.post('/sync', syncDevice);

// Update notification status (public - for TV boxes)
router.post('/notification-status', updateNotificationStatus);

// Clear evacuation status (public - for TV boxes)
router.post('/clear-status', clearEvacuationStatus);

// Admin endpoints (protected)

// Get all devices with pagination and filtering
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      room_number, 
      search 
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = '';
    let params = [];
    let paramCount = 0;

    // Build WHERE clause for filtering
    const conditions = [];
    
    if (status) {
      paramCount++;
      conditions.push(`status = $${paramCount}`);
      params.push(status);
    }
    
    if (room_number) {
      paramCount++;
      conditions.push(`room_number = $${paramCount}`);
      params.push(room_number);
    }
    
    if (search) {
      paramCount++;
      conditions.push(`(device_id ILIKE $${paramCount} OR room_number ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM devices ${whereClause}`;
    const countResult = await query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get devices
    paramCount++;
    const devicesQuery = `
      SELECT 
        id, device_id, room_number, status, last_sync, is_online, 
        last_notification, assigned_bundle_id, is_room_evacuated,
        created_at, updated_at
      FROM devices 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit, offset);

    const devicesResult = await query(devicesQuery, params);

    // Get bundle names for devices
    const devices = await Promise.all(
      devicesResult.rows.map(async (device) => {
        let bundleName = null;
        if (device.assigned_bundle_id) {
          const bundleResult = await query(
            'SELECT name FROM media_bundles WHERE id = $1',
            [device.assigned_bundle_id]
          );
          if (bundleResult.rows.length > 0) {
            bundleName = bundleResult.rows[0].name;
          }
        }
        return { ...device, bundle_name: bundleName };
      })
    );

    res.json({
      devices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    logger.error('Get devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update device
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { room_number, status, assigned_bundle_id, is_room_evacuated } = req.body;

    // Validate status
    if (status && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or inactive' });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (room_number !== undefined) {
      paramCount++;
      updates.push(`room_number = $${paramCount}`);
      params.push(room_number);
    }

    if (status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
    }

    if (assigned_bundle_id !== undefined) {
      paramCount++;
      updates.push(`assigned_bundle_id = $${paramCount}`);
      params.push(assigned_bundle_id);
    }

    if (is_room_evacuated !== undefined) {
      paramCount++;
      updates.push(`is_room_evacuated = $${paramCount}`);
      params.push(is_room_evacuated);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    paramCount++;
    const updateQuery = `
      UPDATE devices 
      SET ${updates.join(', ')}, updated_at = NOW() 
      WHERE id = $${paramCount}
      RETURNING *
    `;
    params.push(id);

    const result = await query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const updatedDevice = result.rows[0];

    // Update Redis cache if evacuation status changed
    if (is_room_evacuated !== undefined) {
      await set(
        `device_evacuation:${updatedDevice.device_id}`,
        is_room_evacuated.toString(),
        300
      );
    }

    logger.info(`Device updated: ${updatedDevice.device_id}`, req.body);

    res.json({
      success: true,
      device: updatedDevice
    });

  } catch (error) {
    logger.error('Update device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete device
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM devices WHERE id = $1 RETURNING device_id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const deviceId = result.rows[0].device_id;

    logger.info(`Device deleted: ${deviceId}`);

    res.json({
      success: true,
      message: 'Device deleted successfully'
    });

  } catch (error) {
    logger.error('Delete device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk actions
router.post('/bulk-actions', authenticateToken, async (req, res) => {
  try {
    const { action, device_ids, data } = req.body;

    if (!action || !device_ids || !Array.isArray(device_ids)) {
      return res.status(400).json({ error: 'Action and device_ids array are required' });
    }

    let result;
    let message;

    switch (action) {
      case 'delete':
        result = await query(
          'DELETE FROM devices WHERE id = ANY($1) RETURNING device_id',
          [device_ids]
        );
        message = `${result.rows.length} devices deleted`;
        break;

      case 'assign_bundle':
        if (!data || !data.bundle_id) {
          return res.status(400).json({ error: 'bundle_id is required for assign_bundle action' });
        }
        result = await query(
          'UPDATE devices SET assigned_bundle_id = $1, updated_at = NOW() WHERE id = ANY($2) RETURNING *',
          [data.bundle_id, device_ids]
        );
        message = `Bundle assigned to ${result.rows.length} devices`;
        break;

      case 'change_status':
        if (!data || !data.status || !['active', 'inactive'].includes(data.status)) {
          return res.status(400).json({ error: 'Valid status is required for change_status action' });
        }
        result = await query(
          'UPDATE devices SET status = $1, updated_at = NOW() WHERE id = ANY($2) RETURNING *',
          [data.status, device_ids]
        );
        message = `Status changed to ${data.status} for ${result.rows.length} devices`;
        break;

      case 'evacuate_rooms':
        result = await query(
          'UPDATE devices SET is_room_evacuated = true, updated_at = NOW() WHERE id = ANY($1) RETURNING *',
          [device_ids]
        );
        
        // Update Redis cache for each device
        await Promise.all(
          result.rows.map(device => 
            set(`device_evacuation:${device.device_id}`, 'true', 300)
          )
        );
        
        message = `Evacuation status set for ${result.rows.length} devices`;
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    logger.info(`Bulk action performed: ${action} on ${device_ids.length} devices`);

    res.json({
      success: true,
      message,
      affected_count: result.rows.length
    });

  } catch (error) {
    logger.error('Bulk action error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
