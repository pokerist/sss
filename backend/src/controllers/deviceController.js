const { query } = require('../config/database');
const { get, set } = require('../config/redis');
const logger = require('../config/logger');
const websocketService = require('../services/websocketService');

// Device sync endpoint - main endpoint for TV boxes
const syncDevice = async (req, res) => {
  try {
    const { device_id } = req.body;
    
    if (!device_id) {
      return res.status(400).json({ error: 'device_id is required' });
    }

    // Check if device exists
    let deviceResult = await query(
      'SELECT * FROM devices WHERE device_id = $1',
      [device_id]
    );

    if (deviceResult.rows.length === 0) {
      // Register new device
      await query(
        'INSERT INTO devices (device_id, last_sync, is_online) VALUES ($1, NOW(), true)',
        [device_id]
      );
      
      logger.info(`New device registered: ${device_id}`);
      
      // Notify admin via WebSocket
      websocketService.broadcast('device_registered', {
        device_id,
        timestamp: new Date().toISOString()
      });
      
      return res.json({ 
        message: 'device registered, admin must activate and assign room number',
        status: 'inactive',
        device_id
      });
    }

    const device = deviceResult.rows[0];

    // Update device online status and last sync
    await query(
      'UPDATE devices SET last_sync = NOW(), is_online = true WHERE device_id = $1',
      [device_id]
    );

    // If device is inactive, return minimal response
    if (device.status !== 'active') {
      return res.json({
        message: 'device registered, admin must activate and assign room number',
        status: 'inactive',
        device_id
      });
    }

    // Device is active, return full configuration
    const response = await buildDeviceResponse(device);
    
    // Cache the response for 5 minutes
    await set(`device_sync:${device_id}`, response, 300);
    
    logger.info(`Device sync successful: ${device_id}`);
    
    return res.json(response);

  } catch (error) {
    logger.error('Device sync error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Build complete device response
const buildDeviceResponse = async (device) => {
  try {
    // Get system settings
    const settingsResult = await query('SELECT hotel_name, hotel_logo_url FROM system_settings LIMIT 1');
    const settings = settingsResult.rows[0] || {};

    // Get guest data for the room
    let guestData = null;
    if (device.room_number) {
      const guestResult = await query(
        'SELECT guest_name, check_in, check_out FROM guest_data WHERE room_number = $1 ORDER BY created_at DESC LIMIT 1',
        [device.room_number]
      );
      if (guestResult.rows.length > 0) {
        guestData = guestResult.rows[0];
      }
    }

    // Get bills for the room
    let bills = [];
    if (device.room_number) {
      const billsResult = await query(
        'SELECT label, amount, bill_date FROM bills WHERE room_number = $1 ORDER BY bill_date DESC',
        [device.room_number]
      );
      bills = billsResult.rows;
    }

    // Get media bundle content
    let mediaContent = [];
    if (device.assigned_bundle_id) {
      const mediaResult = await query(
        'SELECT type, content_url, title, order_index FROM media_content WHERE bundle_id = $1 ORDER BY order_index ASC',
        [device.assigned_bundle_id]
      );
      mediaContent = mediaResult.rows;
    }

    // Get allowed apps
    const appsResult = await query(
      'SELECT name, package_name, apk_url, app_logo_url FROM apps WHERE is_allowed = true ORDER BY sort_order ASC'
    );
    const allowedApps = appsResult.rows;

    // Get pending notifications
    let notifications = [];
    const notificationsResult = await query(
      'SELECT id, title, body, notification_type, guest_name, created_at FROM notifications WHERE device_id = $1 AND status = $2 ORDER BY created_at DESC',
      [device.device_id, 'new']
    );
    notifications = notificationsResult.rows;

    // Mark notifications as sent
    if (notifications.length > 0) {
      const notificationIds = notifications.map(n => n.id);
      await query(
        'UPDATE notifications SET status = $1, sent_at = NOW() WHERE id = ANY($2)',
        ['sent', notificationIds]
      );
    }

    return {
      device_id: device.device_id,
      room_number: device.room_number,
      status: device.status,
      hotel_info: {
        name: settings.hotel_name || 'Hotel TV Management',
        logo_url: settings.hotel_logo_url
      },
      guest_data: guestData,
      bills: bills,
      media_content: mediaContent,
      allowed_apps: allowedApps,
      notifications: notifications,
      sync_timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Error building device response:', error);
    throw error;
  }
};

// Update notification status (viewed/dismissed)
const updateNotificationStatus = async (req, res) => {
  try {
    const { device_id, notification_id, status } = req.body;

    if (!device_id || !notification_id || !status) {
      return res.status(400).json({ error: 'device_id, notification_id, and status are required' });
    }

    if (!['viewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be viewed or dismissed' });
    }

    const updateField = status === 'viewed' ? 'viewed_at' : 'dismissed_at';
    
    const result = await query(
      `UPDATE notifications SET status = $1, ${updateField} = NOW() WHERE id = $2 AND device_id = $3`,
      [status, notification_id, device_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    logger.info(`Notification ${notification_id} marked as ${status} by device ${device_id}`);

    // Notify admin via WebSocket
    websocketService.broadcast('notification_status_updated', {
      notification_id,
      device_id,
      status,
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: 'Notification status updated'
    });

  } catch (error) {
    logger.error('Update notification status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  syncDevice,
  updateNotificationStatus
};
