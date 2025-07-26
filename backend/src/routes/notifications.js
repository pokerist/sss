const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

// Get all notifications with pagination and filtering
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      room_number, 
      notification_type,
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
    
    if (notification_type) {
      paramCount++;
      conditions.push(`notification_type = $${paramCount}`);
      params.push(notification_type);
    }
    
    if (search) {
      paramCount++;
      conditions.push(`(title ILIKE $${paramCount} OR body ILIKE $${paramCount} OR guest_name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM notifications ${whereClause}`;
    const countResult = await query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get notifications
    paramCount++;
    const notificationsQuery = `
      SELECT 
        id, device_id, room_number, title, body, status, notification_type,
        guest_name, scheduled_for, sent_at, viewed_at, dismissed_at, created_at
      FROM notifications 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(limit, offset);

    const notificationsResult = await query(notificationsQuery, params);

    res.json({
      notifications: notificationsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new notification
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      device_id, 
      room_number, 
      title, 
      body, 
      notification_type = 'manual',
      guest_name,
      schedule_for 
    } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    // If room_number is provided but no device_id, find the device
    let targetDeviceId = device_id;
    let targetDevices = [];

    if (device_id) {
      // Single device specified
      targetDevices = [{ device_id, room_number }];
      targetDeviceId = device_id;
    } else if (room_number) {
      // Room number specified, find device for that room
      const deviceResult = await query(
        'SELECT device_id FROM devices WHERE room_number = $1 AND status = $2',
        [room_number, 'active']
      );
      
      if (deviceResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active device found for this room' });
      }
      
      targetDeviceId = deviceResult.rows[0].device_id;
      targetDevices = [{ device_id: targetDeviceId, room_number }];
    } else {
      // No specific device or room, send to all active devices
      const allActiveResult = await query(
        'SELECT device_id, room_number FROM devices WHERE status = $1',
        ['active']
      );
      
      if (allActiveResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active devices found' });
      }
      
      targetDevices = allActiveResult.rows;
      // For single notification, use the first device (this maintains backward compatibility)
      targetDeviceId = targetDevices[0].device_id;
    }

    // Determine scheduled_for time
    let scheduledFor = null;
    if (schedule_for) {
      scheduledFor = new Date(schedule_for);
      if (isNaN(scheduledFor.getTime())) {
        return res.status(400).json({ error: 'Invalid schedule_for date format' });
      }
    }

    const result = await query(`
      INSERT INTO notifications 
      (device_id, room_number, title, body, notification_type, guest_name, scheduled_for) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING *
    `, [targetDeviceId, room_number, title, body, notification_type, guest_name, scheduledFor]);

    const newNotification = result.rows[0];

    logger.info(`Notification created: ${title} for device ${targetDeviceId}`);

    res.json({
      success: true,
      notification: newNotification
    });

  } catch (error) {
    logger.error('Create notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update notification status
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['new', 'sent', 'viewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Build update fields based on status
    let updateFields = 'status = $1';
    let params = [status];
    
    if (status === 'sent') {
      updateFields += ', sent_at = NOW()';
    } else if (status === 'viewed') {
      updateFields += ', viewed_at = NOW()';
    } else if (status === 'dismissed') {
      updateFields += ', dismissed_at = NOW()';
    }

    const result = await query(
      `UPDATE notifications SET ${updateFields} WHERE id = $2 RETURNING *`,
      [...params, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const updatedNotification = result.rows[0];

    logger.info(`Notification ${id} status updated to ${status}`);

    res.json({
      success: true,
      notification: updatedNotification
    });

  } catch (error) {
    logger.error('Update notification status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM notifications WHERE id = $1 RETURNING title, device_id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const deletedNotification = result.rows[0];

    logger.info(`Notification deleted: ${deletedNotification.title}`);

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    logger.error('Delete notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk send notifications
router.post('/bulk-send', authenticateToken, async (req, res) => {
  try {
    const { title, body, target_type, target_rooms, target_devices, schedule_for } = req.body;

    if (!title || !body || !target_type) {
      return res.status(400).json({ error: 'Title, body, and target_type are required' });
    }

    if (!['all_active', 'specific_rooms', 'specific_devices'].includes(target_type)) {
      return res.status(400).json({ error: 'Invalid target_type' });
    }

    let targetDevices = [];

    // Determine target devices based on target_type
    switch (target_type) {
      case 'all_active':
        const allActiveResult = await query(
          'SELECT device_id, room_number FROM devices WHERE status = $1',
          ['active']
        );
        targetDevices = allActiveResult.rows;
        break;

      case 'specific_rooms':
        if (!target_rooms || !Array.isArray(target_rooms)) {
          return res.status(400).json({ error: 'target_rooms array is required for specific_rooms target_type' });
        }
        
        const roomDevicesResult = await query(
          'SELECT device_id, room_number FROM devices WHERE room_number = ANY($1) AND status = $2',
          [target_rooms, 'active']
        );
        targetDevices = roomDevicesResult.rows;
        break;

      case 'specific_devices':
        if (!target_devices || !Array.isArray(target_devices)) {
          return res.status(400).json({ error: 'target_devices array is required for specific_devices target_type' });
        }
        
        const deviceResult = await query(
          'SELECT device_id, room_number FROM devices WHERE device_id = ANY($1) AND status = $2',
          [target_devices, 'active']
        );
        targetDevices = deviceResult.rows;
        break;
    }

    if (targetDevices.length === 0) {
      return res.status(400).json({ error: 'No active devices found for the specified targets' });
    }

    // Determine scheduled_for time
    let scheduledFor = null;
    if (schedule_for) {
      scheduledFor = new Date(schedule_for);
      if (isNaN(scheduledFor.getTime())) {
        return res.status(400).json({ error: 'Invalid schedule_for date format' });
      }
    }

    // Create notifications for all target devices
    const createdNotifications = [];
    for (const device of targetDevices) {
      const result = await query(`
        INSERT INTO notifications 
        (device_id, room_number, title, body, notification_type, scheduled_for) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *
      `, [device.device_id, device.room_number, title, body, 'manual', scheduledFor]);
      
      createdNotifications.push(result.rows[0]);
    }

    logger.info(`Bulk notification sent to ${createdNotifications.length} devices`);

    res.json({
      success: true,
      message: `Notifications sent to ${createdNotifications.length} devices`,
      notifications_created: createdNotifications.length,
      notifications: createdNotifications
    });

  } catch (error) {
    logger.error('Bulk send notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get notification statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'viewed' THEN 1 END) as viewed,
        COUNT(CASE WHEN status = 'dismissed' THEN 1 END) as dismissed,
        COUNT(CASE WHEN notification_type = 'welcome' THEN 1 END) as welcome,
        COUNT(CASE WHEN notification_type = 'farewell' THEN 1 END) as farewell,
        COUNT(CASE WHEN notification_type = 'manual' THEN 1 END) as manual,
        COUNT(CASE WHEN scheduled_for IS NOT NULL AND scheduled_for > NOW() THEN 1 END) as scheduled
      FROM notifications
    `);

    const stats = statsResult.rows[0];

    // Convert counts to integers
    Object.keys(stats).forEach(key => {
      stats[key] = parseInt(stats[key]);
    });

    res.json({ stats });

  } catch (error) {
    logger.error('Get notification stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clean up old notifications
router.post('/cleanup', authenticateToken, async (req, res) => {
  try {
    const { days_old = 30 } = req.body;

    const result = await query(
      'DELETE FROM notifications WHERE created_at < NOW() - INTERVAL \'$1 days\' AND status IN ($2, $3) RETURNING id',
      [days_old, 'viewed', 'dismissed']
    );

    const deletedCount = result.rows.length;

    logger.info(`Cleaned up ${deletedCount} old notifications`);

    res.json({
      success: true,
      message: `${deletedCount} old notifications cleaned up`,
      deleted_count: deletedCount
    });

  } catch (error) {
    logger.error('Cleanup notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
