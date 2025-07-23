const { query } = require('../config/database');
const logger = require('../config/logger');
const websocketService = require('./websocketService');

class NotificationService {
  constructor() {
    this.lastProcessedGuests = new Map(); // Track guest changes for notifications
  }

  async processGuestCheckinCheckout(roomNumber, guestData) {
    try {
      let generated = 0;
      
      if (!guestData || !guestData.guest_name) {
        return { generated };
      }

      const guestKey = `${roomNumber}_${guestData.guest_name}`;
      const lastProcessed = this.lastProcessedGuests.get(guestKey);
      
      // Check if this is a new check-in (welcome message)
      if (!lastProcessed || (guestData.check_in && new Date(guestData.check_in) > lastProcessed.checkInTime)) {
        await this.generateWelcomeNotification(roomNumber, guestData);
        generated++;
      }

      // Schedule farewell message if checkout time is available
      if (guestData.check_out) {
        await this.scheduleFarewellNotification(roomNumber, guestData);
        generated++;
      }

      // Update tracking
      this.lastProcessedGuests.set(guestKey, {
        checkInTime: new Date(guestData.check_in),
        checkOutTime: new Date(guestData.check_out),
        processed: new Date()
      });

      return { generated };

    } catch (error) {
      logger.error('Error processing guest checkin/checkout:', error);
      return { generated: 0, error: error.message };
    }
  }

  async generateWelcomeNotification(roomNumber, guestData) {
    try {
      // Get hotel name for personalization
      const settingsResult = await query('SELECT hotel_name FROM system_settings LIMIT 1');
      const hotelName = settingsResult.rows[0]?.hotel_name || 'our hotel';

      // Get device ID for this room
      const deviceResult = await query(
        'SELECT device_id FROM devices WHERE room_number = $1 AND status = $2',
        [roomNumber, 'active']
      );

      if (deviceResult.rows.length === 0) {
        logger.warn(`No active device found for room ${roomNumber} for welcome notification`);
        return;
      }

      const deviceId = deviceResult.rows[0].device_id;

      // Check if welcome notification already exists for this guest
      const existingResult = await query(
        'SELECT id FROM notifications WHERE device_id = $1 AND notification_type = $2 AND guest_name = $3 AND created_at > NOW() - INTERVAL \'1 day\'',
        [deviceId, 'welcome', guestData.guest_name]
      );

      if (existingResult.rows.length > 0) {
        logger.debug(`Welcome notification already exists for ${guestData.guest_name} in room ${roomNumber}`);
        return;
      }

      const welcomeTitle = 'Welcome';
      const welcomeBody = `Welcome ${guestData.guest_name}, we hope you enjoy your stay at ${hotelName}. Have a wonderful time!`;

      const result = await query(`
        INSERT INTO notifications 
        (device_id, room_number, title, body, notification_type, guest_name, status) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
        RETURNING *
      `, [deviceId, roomNumber, welcomeTitle, welcomeBody, 'welcome', guestData.guest_name, 'new']);

      const notification = result.rows[0];

      logger.info(`Welcome notification generated for ${guestData.guest_name} in room ${roomNumber}`);

      // Notify admin via WebSocket
      websocketService.broadcast('notification_generated', {
        type: 'welcome',
        notification,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error generating welcome notification:', error);
      throw error;
    }
  }

  async scheduleFarewellNotification(roomNumber, guestData) {
    try {
      const checkoutTime = new Date(guestData.check_out);
      
      // Schedule farewell message 15 minutes before checkout
      const farewellTime = new Date(checkoutTime.getTime() - 15 * 60 * 1000);
      
      // Don't schedule if farewell time is in the past
      if (farewellTime <= new Date()) {
        logger.debug(`Farewell time is in the past for ${guestData.guest_name} in room ${roomNumber}`);
        return;
      }

      // Get hotel name for personalization
      const settingsResult = await query('SELECT hotel_name FROM system_settings LIMIT 1');
      const hotelName = settingsResult.rows[0]?.hotel_name || 'our hotel';

      // Get device ID for this room
      const deviceResult = await query(
        'SELECT device_id FROM devices WHERE room_number = $1 AND status = $2',
        [roomNumber, 'active']
      );

      if (deviceResult.rows.length === 0) {
        logger.warn(`No active device found for room ${roomNumber} for farewell notification`);
        return;
      }

      const deviceId = deviceResult.rows[0].device_id;

      // Check if farewell notification already exists for this guest
      const existingResult = await query(
        'SELECT id FROM notifications WHERE device_id = $1 AND notification_type = $2 AND guest_name = $3 AND scheduled_for IS NOT NULL',
        [deviceId, 'farewell', guestData.guest_name]
      );

      if (existingResult.rows.length > 0) {
        logger.debug(`Farewell notification already scheduled for ${guestData.guest_name} in room ${roomNumber}`);
        return;
      }

      const farewellTitle = 'Thank You';
      const farewellBody = `Thank you for staying with us, ${guestData.guest_name}! We hope you enjoyed your time at ${hotelName} and look forward to seeing you again soon.`;

      const result = await query(`
        INSERT INTO notifications 
        (device_id, room_number, title, body, notification_type, guest_name, scheduled_for, status) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING *
      `, [deviceId, roomNumber, farewellTitle, farewellBody, 'farewell', guestData.guest_name, farewellTime, 'new']);

      const notification = result.rows[0];

      logger.info(`Farewell notification scheduled for ${guestData.guest_name} in room ${roomNumber} at ${farewellTime}`);

      // Notify admin via WebSocket
      websocketService.broadcast('notification_scheduled', {
        type: 'farewell',
        notification,
        scheduled_for: farewellTime,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error scheduling farewell notification:', error);
      throw error;
    }
  }

  async processScheduledNotifications() {
    try {
      // Find notifications that are scheduled for now or past
      const scheduledResult = await query(`
        SELECT * FROM notifications 
        WHERE scheduled_for IS NOT NULL 
        AND scheduled_for <= NOW() 
        AND status = $1
        ORDER BY scheduled_for ASC
      `, ['new']);

      const processedCount = scheduledResult.rows.length;

      if (processedCount === 0) {
        return { processed: 0 };
      }

      // Update status to 'new' and clear scheduled_for to make them available for immediate delivery
      const notificationIds = scheduledResult.rows.map(n => n.id);
      
      await query(
        'UPDATE notifications SET scheduled_for = NULL WHERE id = ANY($1)',
        [notificationIds]
      );

      logger.info(`Processed ${processedCount} scheduled notifications`);

      // Notify admin via WebSocket
      websocketService.broadcast('scheduled_notifications_processed', {
        count: processedCount,
        timestamp: new Date().toISOString()
      });

      return { processed: processedCount };

    } catch (error) {
      logger.error('Error processing scheduled notifications:', error);
      return { processed: 0, error: error.message };
    }
  }

  async cleanupOldNotifications() {
    try {
      // Delete viewed/dismissed notifications older than 7 days
      const cleanupResult = await query(`
        DELETE FROM notifications 
        WHERE status IN ($1, $2) 
        AND (viewed_at < NOW() - INTERVAL '7 days' OR dismissed_at < NOW() - INTERVAL '7 days')
        RETURNING id
      `, ['viewed', 'dismissed']);

      const cleanedCount = cleanupResult.rows.length;

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} old notifications`);
      }

      return { cleaned: cleanedCount };

    } catch (error) {
      logger.error('Error cleaning up old notifications:', error);
      return { cleaned: 0, error: error.message };
    }
  }

  async getNotificationStats() {
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
          COUNT(CASE WHEN scheduled_for IS NOT NULL AND scheduled_for > NOW() THEN 1 END) as scheduled_future,
          AVG(CASE WHEN viewed_at IS NOT NULL AND sent_at IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (viewed_at - sent_at)) END) as avg_view_time_seconds
        FROM notifications
      `);

      const stats = statsResult.rows[0];

      // Convert counts to integers and format averages
      Object.keys(stats).forEach(key => {
        if (key === 'avg_view_time_seconds') {
          stats[key] = stats[key] ? Math.round(parseFloat(stats[key])) : null;
        } else {
          stats[key] = parseInt(stats[key] || 0);
        }
      });

      return stats;

    } catch (error) {
      logger.error('Error getting notification stats:', error);
      throw error;
    }
  }

  async sendSystemNotification(title, body, targetType = 'all_active', targetRooms = null) {
    try {
      let targetDevices = [];

      switch (targetType) {
        case 'all_active':
          const allActiveResult = await query(
            'SELECT device_id, room_number FROM devices WHERE status = $1',
            ['active']
          );
          targetDevices = allActiveResult.rows;
          break;

        case 'specific_rooms':
          if (!targetRooms || !Array.isArray(targetRooms)) {
            throw new Error('targetRooms array is required for specific_rooms target type');
          }
          
          const roomDevicesResult = await query(
            'SELECT device_id, room_number FROM devices WHERE room_number = ANY($1) AND status = $2',
            [targetRooms, 'active']
          );
          targetDevices = roomDevicesResult.rows;
          break;

        default:
          throw new Error('Invalid target type for system notification');
      }

      if (targetDevices.length === 0) {
        return { sent: 0, message: 'No active devices found' };
      }

      // Create system notifications
      let sentCount = 0;
      for (const device of targetDevices) {
        await query(`
          INSERT INTO notifications 
          (device_id, room_number, title, body, notification_type, status) 
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [device.device_id, device.room_number, title, body, 'system', 'new']);
        
        sentCount++;
      }

      logger.info(`System notification sent to ${sentCount} devices: ${title}`);

      return { sent: sentCount };

    } catch (error) {
      logger.error('Error sending system notification:', error);
      throw error;
    }
  }
}

// Create singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;
