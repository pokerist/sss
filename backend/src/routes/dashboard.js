const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();

// Get dashboard statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Get total devices count
    const totalDevicesResult = await query('SELECT COUNT(*) FROM devices');
    const totalDevices = parseInt(totalDevicesResult.rows[0].count);

    // Get active devices count
    const activeDevicesResult = await query('SELECT COUNT(*) FROM devices WHERE status = $1', ['active']);
    const activeDevices = parseInt(activeDevicesResult.rows[0].count);

    // Get online devices count (devices that synced in last 3 minutes)
    const onlineDevicesResult = await query(
      'SELECT COUNT(*) FROM devices WHERE status = $1 AND last_sync > NOW() - INTERVAL \'3 minutes\'',
      ['active']
    );
    const onlineDevices = parseInt(onlineDevicesResult.rows[0].count);

    // Get bills count
    const billsResult = await query('SELECT COUNT(*) FROM bills');
    const totalBills = parseInt(billsResult.rows[0].count);

    // Get media bundles count
    const bundlesResult = await query('SELECT COUNT(*) FROM media_bundles');
    const totalBundles = parseInt(bundlesResult.rows[0].count);

    // Get apps count
    const appsResult = await query('SELECT COUNT(*) FROM apps');
    const totalApps = parseInt(appsResult.rows[0].count);

    // Get notifications stats
    const notificationsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'viewed' THEN 1 END) as viewed
      FROM notifications
    `);
    const notificationStats = notificationsResult.rows[0];

    // Get PMS connection status
    const pmsStatusResult = await query('SELECT pms_connection_status FROM system_settings LIMIT 1');
    const pmsStatus = pmsStatusResult.rows[0]?.pms_connection_status || 'disconnected';

    // Get recent activity (last 10 device registrations/updates)
    const recentActivityResult = await query(`
      SELECT device_id, status, room_number, updated_at, 'device_update' as activity_type
      FROM devices 
      ORDER BY updated_at DESC 
      LIMIT 10
    `);

    // Get guest data count
    const guestDataResult = await query('SELECT COUNT(*) FROM guest_data');
    const totalGuests = parseInt(guestDataResult.rows[0].count);

    const stats = {
      devices: {
        total: totalDevices,
        active: activeDevices,
        online: onlineDevices,
        offline: activeDevices - onlineDevices
      },
      content: {
        bundles: totalBundles,
        apps: totalApps
      },
      pms: {
        status: pmsStatus,
        bills_retrieved: totalBills,
        guests: totalGuests
      },
      notifications: {
        total: parseInt(notificationStats.total),
        pending: parseInt(notificationStats.pending),
        sent: parseInt(notificationStats.sent),
        viewed: parseInt(notificationStats.viewed)
      },
      recent_activity: recentActivityResult.rows
    };

    res.json(stats);

  } catch (error) {
    logger.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get system health
router.get('/health', authenticateToken, async (req, res) => {
  try {
    // Check database connection
    const dbStart = Date.now();
    await query('SELECT 1');
    const dbLatency = Date.now() - dbStart;

    // Check for offline devices
    const offlineDevicesResult = await query(
      'SELECT COUNT(*) FROM devices WHERE status = $1 AND (is_online = false OR last_sync < NOW() - INTERVAL \'10 minutes\')',
      ['active']
    );
    const offlineDevices = parseInt(offlineDevicesResult.rows[0].count);

    // Check for failed notifications
    const failedNotificationsResult = await query(
      'SELECT COUNT(*) FROM notifications WHERE status = $1 AND created_at < NOW() - INTERVAL \'1 hour\'',
      ['new']
    );
    const failedNotifications = parseInt(failedNotificationsResult.rows[0].count);

    // System uptime
    const uptime = process.uptime();

    // Memory usage
    const memoryUsage = process.memoryUsage();

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: uptime,
      database: {
        status: 'connected',
        latency: dbLatency
      },
      alerts: {
        offline_devices: offlineDevices,
        failed_notifications: failedNotifications
      },
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024)
      }
    };

    // Determine overall health status
    if (offlineDevices > 5 || failedNotifications > 10 || dbLatency > 1000) {
      health.status = 'warning';
    }

    if (offlineDevices > 20 || failedNotifications > 50 || dbLatency > 5000) {
      health.status = 'critical';
    }

    res.json(health);

  } catch (error) {
    logger.error('System health check error:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Get recent logs
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const { level = 'info', limit = 100 } = req.query;
    
    // This is a simplified log endpoint
    // In production, you might want to read from log files or use a proper logging service
    const logs = [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Dashboard logs endpoint accessed',
        service: 'hotel-tv-backend'
      }
    ];

    res.json({
      logs,
      total: logs.length,
      level,
      limit: parseInt(limit)
    });

  } catch (error) {
    logger.error('Get logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
