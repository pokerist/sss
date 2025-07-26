const cron = require('node-cron');
const pmsService = require('./pmsService');
const notificationService = require('./notificationService');
const logger = require('../config/logger');

class SchedulerService {
  constructor() {
    this.jobs = [];
    this.isStarted = false;
  }

  start() {
    if (this.isStarted) {
      logger.warn('Scheduler service already started');
      return;
    }

    try {
      // PMS Sync - every 5 minutes (only if PMS is properly configured)
      const pmsSyncJob = cron.schedule('*/5 * * * *', async () => {
        logger.debug('Checking PMS configuration for scheduled sync');
        try {
          const pmsStatus = pmsService.getSyncStatus();
          if (pmsStatus.isInitialized && pmsService.config) {
            logger.debug('Running scheduled PMS sync');
            await pmsService.startSync();
          } else {
            logger.debug('PMS not configured, skipping sync');
          }
        } catch (error) {
          logger.error('Scheduled PMS sync failed:', error);
        }
      }, {
        scheduled: false,
        timezone: 'UTC'
      });

      // Notification Processing - every minute
      const notificationProcessingJob = cron.schedule('* * * * *', async () => {
        logger.debug('Processing scheduled notifications');
        try {
          await notificationService.processScheduledNotifications();
        } catch (error) {
          logger.error('Scheduled notification processing failed:', error);
        }
      }, {
        scheduled: false,
        timezone: 'UTC'
      });

      // Notification Cleanup - daily at 2 AM
      const notificationCleanupJob = cron.schedule('0 2 * * *', async () => {
        logger.debug('Running notification cleanup');
        try {
          await notificationService.cleanupOldNotifications();
        } catch (error) {
          logger.error('Scheduled notification cleanup failed:', error);
        }
      }, {
        scheduled: false,
        timezone: 'UTC'
      });

      // Device Status Check - every 10 minutes
      const deviceStatusJob = cron.schedule('*/10 * * * *', async () => {
        logger.debug('Checking device status');
        try {
          await this.checkDeviceStatus();
        } catch (error) {
          logger.error('Device status check failed:', error);
        }
      }, {
        scheduled: false,
        timezone: 'UTC'
      });

      // System Health Check - every hour
      const healthCheckJob = cron.schedule('0 * * * *', async () => {
        logger.debug('Running system health check');
        try {
          await this.systemHealthCheck();
        } catch (error) {
          logger.error('System health check failed:', error);
        }
      }, {
        scheduled: false,
        timezone: 'UTC'
      });

      // Store job references
      this.jobs = [
        { name: 'PMS Sync', job: pmsSyncJob, interval: '5 minutes' },
        { name: 'Notification Processing', job: notificationProcessingJob, interval: '1 minute' },
        { name: 'Notification Cleanup', job: notificationCleanupJob, interval: 'daily at 2 AM' },
        { name: 'Device Status Check', job: deviceStatusJob, interval: '10 minutes' },
        { name: 'System Health Check', job: healthCheckJob, interval: '1 hour' }
      ];

      // Start all jobs
      this.jobs.forEach(({ name, job }) => {
        job.start();
        logger.info(`Scheduled job started: ${name}`);
      });

      this.isStarted = true;
      logger.info('Scheduler service started successfully');

    } catch (error) {
      logger.error('Failed to start scheduler service:', error);
      throw error;
    }
  }

  stop() {
    if (!this.isStarted) {
      logger.warn('Scheduler service not started');
      return;
    }

    try {
      this.jobs.forEach(({ name, job }) => {
        job.stop();
        logger.info(`Scheduled job stopped: ${name}`);
      });

      this.jobs = [];
      this.isStarted = false;
      logger.info('Scheduler service stopped');

    } catch (error) {
      logger.error('Failed to stop scheduler service:', error);
      throw error;
    }
  }

  async checkDeviceStatus() {
    try {
      const { query } = require('../config/database');
      
      // Mark devices as offline if they haven't synced in 10 minutes
      const result = await query(`
        UPDATE devices 
        SET is_online = false 
        WHERE last_sync < NOW() - INTERVAL '10 minutes' 
        AND is_online = true
        RETURNING device_id
      `);

      if (result.rows.length > 0) {
        logger.info(`Marked ${result.rows.length} devices as offline`);
        
        // Send notification if many devices go offline
        if (result.rows.length >= 5) {
          await notificationService.sendSystemNotification(
            'System Alert',
            `${result.rows.length} devices have gone offline and may need attention.`,
            'all_active'
          );
        }
      }

    } catch (error) {
      logger.error('Device status check error:', error);
      throw error;
    }
  }

  async systemHealthCheck() {
    try {
      const { query } = require('../config/database');
      
      // Check database connection
      await query('SELECT 1');
      
      // Check for system issues
      const issues = [];
      
      // Check for high number of offline devices
      const offlineDevicesResult = await query(
        'SELECT COUNT(*) FROM devices WHERE status = $1 AND is_online = false',
        ['active']
      );
      const offlineDevices = parseInt(offlineDevicesResult.rows[0].count);
      
      if (offlineDevices > 10) {
        issues.push(`${offlineDevices} devices are offline`);
      }
      
      // Check for stuck notifications
      const stuckNotificationsResult = await query(
        'SELECT COUNT(*) FROM notifications WHERE status = $1 AND created_at < NOW() - INTERVAL \'2 hours\'',
        ['new']
      );
      const stuckNotifications = parseInt(stuckNotificationsResult.rows[0].count);
      
      if (stuckNotifications > 5) {
        issues.push(`${stuckNotifications} notifications are stuck in queue`);
      }
      
      // Check PMS connection
      const pmsStatus = pmsService.getSyncStatus();
      if (!pmsStatus.isInitialized || pmsStatus.connectionStatus !== 'connected') {
        issues.push('PMS connection is not healthy');
      }
      
      // Log system health
      if (issues.length > 0) {
        logger.warn('System health issues detected:', issues);
        
        // Send alert to system administrators
        // In a real system, this could be an email, Slack notification, etc.
        logger.error('SYSTEM HEALTH ALERT:', issues.join(', '));
      } else {
        logger.debug('System health check passed');
      }
      
    } catch (error) {
      logger.error('System health check error:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isStarted: this.isStarted,
      jobCount: this.jobs.length,
      jobs: this.jobs.map(({ name, interval }) => ({
        name,
        interval,
        status: 'running'
      }))
    };
  }

  // Manual trigger methods for testing/admin use
  async triggerPMSSync() {
    try {
      logger.info('Manually triggering PMS sync');
      await pmsService.startSync();
      return { success: true, message: 'PMS sync triggered successfully' };
    } catch (error) {
      logger.error('Manual PMS sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  async triggerNotificationProcessing() {
    try {
      logger.info('Manually triggering notification processing');
      const result = await notificationService.processScheduledNotifications();
      return { success: true, result };
    } catch (error) {
      logger.error('Manual notification processing failed:', error);
      return { success: false, error: error.message };
    }
  }

  async triggerCleanup() {
    try {
      logger.info('Manually triggering cleanup');
      const result = await notificationService.cleanupOldNotifications();
      return { success: true, result };
    } catch (error) {
      logger.error('Manual cleanup failed:', error);
      return { success: false, error: error.message };
    }
  }

  async triggerDeviceStatusCheck() {
    try {
      logger.info('Manually triggering device status check');
      await this.checkDeviceStatus();
      return { success: true, message: 'Device status check completed' };
    } catch (error) {
      logger.error('Manual device status check failed:', error);
      return { success: false, error: error.message };
    }
  }

  async triggerHealthCheck() {
    try {
      logger.info('Manually triggering health check');
      await this.systemHealthCheck();
      return { success: true, message: 'Health check completed' };
    } catch (error) {
      logger.error('Manual health check failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;
