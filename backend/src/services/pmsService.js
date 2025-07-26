const axios = require('axios');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { set, get } = require('../config/redis');
const logger = require('../config/logger');
const notificationService = require('./notificationService');

class PMSService {
  constructor() {
    this.config = null;
    this.isInitialized = false;
    this.lastSyncTime = null;
    this.syncInProgress = false;
    this.httpClient = null;
  }

  async init() {
    try {
      await this.loadConfiguration();
      if (this.config) {
        await this.setupHttpClient();
        this.isInitialized = true;
        logger.info('PMS Service initialized successfully');
      } else {
        logger.warn('PMS Service not configured');
      }
    } catch (error) {
      logger.error('Failed to initialize PMS Service:', error);
      this.isInitialized = false;
    }
  }

  async loadConfiguration() {
    try {
      const result = await query(`
        SELECT 
          pms_base_url, 
          pms_api_key, 
          pms_username, 
          pms_password_hash,
          pms_connection_status
        FROM system_settings 
        LIMIT 1
      `);

      // Reset config first
      this.config = null;

      if (result.rows.length > 0) {
        const settings = result.rows[0];
        
        // Validate that all required fields are present and not empty
        if (settings.pms_base_url && settings.pms_base_url.trim() &&
            settings.pms_api_key && settings.pms_api_key.trim() && 
            settings.pms_username && settings.pms_username.trim() &&
            settings.pms_password_hash && settings.pms_password_hash.trim()) {
          
          this.config = {
            baseUrl: settings.pms_base_url.trim(),
            apiKey: settings.pms_api_key.trim(),
            username: settings.pms_username.trim(),
            passwordHash: settings.pms_password_hash.trim(),
            connectionStatus: settings.pms_connection_status || 'disconnected'
          };
          
          logger.debug('PMS configuration loaded successfully');
        } else {
          logger.debug('PMS configuration incomplete - missing required fields');
        }
      } else {
        logger.debug('No system settings found - PMS not configured');
      }
    } catch (error) {
      logger.error('Failed to load PMS configuration:', error);
      this.config = null;
      throw error;
    }
  }

  async setupHttpClient() {
    if (!this.config) {
      throw new Error('PMS configuration not loaded');
    }

    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: parseInt(process.env.PMS_CONNECTION_TIMEOUT) || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      }
    });

    // Add request interceptor for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        logger.debug('PMS API Request:', { url: config.url, method: config.method });
        return config;
      },
      (error) => {
        logger.error('PMS API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug('PMS API Response:', { 
          url: response.config.url, 
          status: response.status 
        });
        return response;
      },
      (error) => {
        logger.error('PMS API Response Error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  async testConnection(testConfig = null) {
    try {
      const config = testConfig || this.config;
      
      if (!config) {
        return {
          success: false,
          error: 'PMS configuration not available'
        };
      }

      // Create test HTTP client
      const testClient = axios.create({
        baseURL: config.baseUrl,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        }
      });

      // Test basic connectivity with a simple endpoint
      const response = await testClient.get('/api/v1/hotels');
      
      return {
        success: true,
        info: {
          status: response.status,
          responseTime: response.headers['x-response-time'] || 'N/A',
          serverInfo: response.data?.server_info || 'Opera Cloud PMS'
        }
      };

    } catch (error) {
      let errorMessage = 'Connection failed';
      
      if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused - server unreachable';
      } else if (error.response?.status === 401) {
        errorMessage = 'Authentication failed - invalid credentials';
      } else if (error.response?.status === 403) {
        errorMessage = 'Access forbidden - insufficient permissions';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Server error - PMS system unavailable';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timeout - server not responding';
      }

      return {
        success: false,
        error: errorMessage,
        details: error.message
      };
    }
  }

  async startSync() {
    if (!this.isInitialized || this.syncInProgress || !this.config) {
      logger.debug('PMS sync skipped - not initialized, already in progress, or not configured');
      return;
    }

    try {
      this.syncInProgress = true;
      logger.info('Starting PMS sync');

      // Get list of rooms with active devices
      const activeDevicesResult = await query(
        'SELECT DISTINCT room_number FROM devices WHERE status = $1 AND room_number IS NOT NULL',
        ['active']
      );

      const roomNumbers = activeDevicesResult.rows.map(row => row.room_number);
      
      if (roomNumbers.length === 0) {
        logger.info('No active devices with room numbers found');
        return;
      }

      // Sync guest data and bills for each room
      const syncResults = {
        guestsUpdated: 0,
        billsUpdated: 0,
        notificationsGenerated: 0,
        errors: []
      };

      for (const roomNumber of roomNumbers) {
        try {
          // Check cache first
          const cacheKey = `pms_room_${roomNumber}`;
          let cachedData = await get(cacheKey);

          if (!cachedData) {
            // Fetch from PMS
            const roomData = await this.fetchRoomData(roomNumber);
            if (roomData) {
              // Cache for 2 minutes
              await set(cacheKey, roomData, 120);
              cachedData = roomData;
            }
          }

          if (cachedData) {
            await this.updateGuestData(roomNumber, cachedData.guest);
            await this.updateBillData(roomNumber, cachedData.bills);
            
            syncResults.guestsUpdated++;
            syncResults.billsUpdated += cachedData.bills.length;

            // Generate automated notifications if needed
            const notificationResult = await notificationService.processGuestCheckinCheckout(
              roomNumber, 
              cachedData.guest
            );
            syncResults.notificationsGenerated += notificationResult.generated;
          }

        } catch (roomError) {
          logger.error(`Failed to sync room ${roomNumber}:`, roomError);
          syncResults.errors.push(`Room ${roomNumber}: ${roomError.message}`);
        }
      }

      // Update connection status
      await query(
        'UPDATE system_settings SET pms_connection_status = $1 WHERE id = 1',
        ['connected']
      );

      this.lastSyncTime = new Date();
      
      logger.info('PMS sync completed:', syncResults);

    } catch (error) {
      logger.error('PMS sync failed:', error);
      
      // Update connection status
      await query(
        'UPDATE system_settings SET pms_connection_status = $1 WHERE id = 1',
        ['error']
      );
      
    } finally {
      this.syncInProgress = false;
    }
  }

  async fetchRoomData(roomNumber) {
    try {
      if (!this.httpClient) {
        throw new Error('PMS client not initialized');
      }

      // Fetch guest information
      const guestResponse = await this.httpClient.get(`/api/v1/rooms/${roomNumber}/guest`);
      const guest = guestResponse.data;

      // Fetch folio/billing information  
      const folioResponse = await this.httpClient.get(`/api/v1/rooms/${roomNumber}/folio`);
      const bills = folioResponse.data.charges || [];

      return {
        guest: guest,
        bills: bills.map(charge => ({
          label: charge.description || charge.item_name,
          amount: parseFloat(charge.amount || 0),
          bill_date: new Date(charge.post_date || charge.created_at)
        }))
      };

    } catch (error) {
      if (error.response?.status === 404) {
        // Room not found or no guest - this is normal
        return null;
      }
      throw error;
    }
  }

  async updateGuestData(roomNumber, guestData) {
    try {
      if (!guestData || !guestData.guest_name) {
        // Clear guest data if no guest
        await query(
          'DELETE FROM guest_data WHERE room_number = $1',
          [roomNumber]
        );
        return;
      }

      // Check if guest data has changed
      const existingResult = await query(
        'SELECT * FROM guest_data WHERE room_number = $1 ORDER BY created_at DESC LIMIT 1',
        [roomNumber]
      );

      const checkIn = new Date(guestData.check_in);
      const checkOut = new Date(guestData.check_out);

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        
        // Update if data has changed
        if (existing.guest_name !== guestData.guest_name ||
            existing.check_in?.getTime() !== checkIn.getTime() ||
            existing.check_out?.getTime() !== checkOut.getTime()) {
          
          await query(
            'UPDATE guest_data SET guest_name = $1, check_in = $2, check_out = $3, last_pms_sync = NOW() WHERE id = $4',
            [guestData.guest_name, checkIn, checkOut, existing.id]
          );
        }
      } else {
        // Insert new guest data
        await query(
          'INSERT INTO guest_data (room_number, guest_name, check_in, check_out) VALUES ($1, $2, $3, $4)',
          [roomNumber, guestData.guest_name, checkIn, checkOut]
        );
      }

    } catch (error) {
      logger.error(`Failed to update guest data for room ${roomNumber}:`, error);
      throw error;
    }
  }

  async updateBillData(roomNumber, billsData) {
    try {
      if (!billsData || billsData.length === 0) {
        return;
      }

      // Clear existing bills for this room (to avoid duplicates)
      await query(
        'DELETE FROM bills WHERE room_number = $1',
        [roomNumber]
      );

      // Insert new bills
      for (const bill of billsData) {
        await query(
          'INSERT INTO bills (room_number, label, amount, bill_date) VALUES ($1, $2, $3, $4)',
          [roomNumber, bill.label, bill.amount, bill.bill_date]
        );
      }

    } catch (error) {
      logger.error(`Failed to update bill data for room ${roomNumber}:`, error);
      throw error;
    }
  }

  async updateConfiguration() {
    try {
      await this.loadConfiguration();
      if (this.config) {
        await this.setupHttpClient();
        this.isInitialized = true;
        logger.info('PMS configuration updated');
      } else {
        this.isInitialized = false;
        logger.warn('PMS configuration cleared');
      }
    } catch (error) {
      logger.error('Failed to update PMS configuration:', error);
      this.isInitialized = false;
    }
  }

  async forcSync() {
    try {
      if (this.syncInProgress) {
        return {
          success: false,
          error: 'Sync already in progress'
        };
      }

      await this.startSync();
      
      return {
        success: true,
        message: 'Sync completed successfully',
        lastSyncTime: this.lastSyncTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  getSyncStatus() {
    return {
      isInitialized: this.isInitialized,
      syncInProgress: this.syncInProgress,
      lastSyncTime: this.lastSyncTime,
      connectionStatus: this.config?.connectionStatus || 'disconnected'
    };
  }
}

// Create singleton instance
const pmsService = new PMSService();

module.exports = pmsService;
