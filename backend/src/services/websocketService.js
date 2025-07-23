const WebSocket = require('ws');
const url = require('url');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { query } = require('../config/database');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Store authenticated clients
    this.isInitialized = false;
  }

  init(server) {
    try {
      this.wss = new WebSocket.Server({ 
        server,
        path: '/ws',
        verifyClient: this.verifyClient.bind(this)
      });

      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', this.handleError.bind(this));
      
      this.isInitialized = true;
      logger.info('WebSocket server initialized');

    } catch (error) {
      logger.error('Failed to initialize WebSocket server:', error);
      throw error;
    }
  }

  async verifyClient(info) {
    try {
      const { query: queryParams } = url.parse(info.req.url, true);
      const token = queryParams.token;

      if (!token) {
        logger.warn('WebSocket connection rejected: No token provided');
        return false;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Verify user exists in database
      const result = await query(
        'SELECT id, admin_username FROM system_settings WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        logger.warn('WebSocket connection rejected: Invalid user');
        return false;
      }

      // Store user info for this connection
      info.req.user = {
        id: decoded.userId,
        username: result.rows[0].admin_username
      };

      return true;

    } catch (error) {
      logger.warn('WebSocket connection rejected:', error.message);
      return false;
    }
  }

  handleConnection(ws, req) {
    try {
      const user = req.user;
      const clientId = this.generateClientId();
      
      // Store client connection
      this.clients.set(clientId, {
        ws,
        user,
        connected: new Date(),
        lastPing: new Date()
      });

      logger.info(`WebSocket client connected: ${user.username} (${clientId})`);

      // Send welcome message
      this.sendToClient(clientId, 'connection_established', {
        clientId,
        message: 'WebSocket connection established',
        timestamp: new Date().toISOString()
      });

      // Handle messages from client
      ws.on('message', (data) => {
        this.handleMessage(clientId, data);
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.handleDisconnection(clientId);
      });

      // Handle connection errors
      ws.on('error', (error) => {
        logger.error(`WebSocket client error (${clientId}):`, error);
        this.handleDisconnection(clientId);
      });

      // Set up ping/pong for connection health
      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.lastPing = new Date();
        }
      });

    } catch (error) {
      logger.error('Error handling WebSocket connection:', error);
      ws.close();
    }
  }

  handleMessage(clientId, data) {
    try {
      const client = this.clients.get(clientId);
      if (!client) {
        return;
      }

      const message = JSON.parse(data.toString());
      
      logger.debug(`WebSocket message from ${client.user.username}:`, message);

      // Handle different message types
      switch (message.type) {
        case 'ping':
          this.sendToClient(clientId, 'pong', {
            timestamp: new Date().toISOString()
          });
          break;

        case 'subscribe':
          // Handle subscription to specific events
          this.handleSubscription(clientId, message.data);
          break;

        case 'unsubscribe':
          // Handle unsubscription from events
          this.handleUnsubscription(clientId, message.data);
          break;

        default:
          logger.warn(`Unknown WebSocket message type: ${message.type}`);
          this.sendToClient(clientId, 'error', {
            error: 'Unknown message type',
            originalMessage: message
          });
      }

    } catch (error) {
      logger.error(`Error handling WebSocket message from ${clientId}:`, error);
      this.sendToClient(clientId, 'error', {
        error: 'Invalid message format'
      });
    }
  }

  handleSubscription(clientId, data) {
    try {
      const client = this.clients.get(clientId);
      if (!client) {
        return;
      }

      // Initialize subscriptions if not exists
      if (!client.subscriptions) {
        client.subscriptions = new Set();
      }

      if (data.events && Array.isArray(data.events)) {
        data.events.forEach(event => {
          client.subscriptions.add(event);
        });
        
        logger.debug(`Client ${clientId} subscribed to events:`, data.events);
        
        this.sendToClient(clientId, 'subscription_confirmed', {
          events: data.events,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      logger.error(`Error handling subscription for ${clientId}:`, error);
    }
  }

  handleUnsubscription(clientId, data) {
    try {
      const client = this.clients.get(clientId);
      if (!client || !client.subscriptions) {
        return;
      }

      if (data.events && Array.isArray(data.events)) {
        data.events.forEach(event => {
          client.subscriptions.delete(event);
        });
        
        logger.debug(`Client ${clientId} unsubscribed from events:`, data.events);
        
        this.sendToClient(clientId, 'unsubscription_confirmed', {
          events: data.events,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      logger.error(`Error handling unsubscription for ${clientId}:`, error);
    }
  }

  handleDisconnection(clientId) {
    try {
      const client = this.clients.get(clientId);
      if (client) {
        logger.info(`WebSocket client disconnected: ${client.user.username} (${clientId})`);
        this.clients.delete(clientId);
      }
    } catch (error) {
      logger.error(`Error handling disconnection for ${clientId}:`, error);
    }
  }

  handleError(error) {
    logger.error('WebSocket server error:', error);
  }

  sendToClient(clientId, type, data) {
    try {
      const client = this.clients.get(clientId);
      if (!client) {
        return false;
      }

      if (client.ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
          type,
          data,
          timestamp: new Date().toISOString()
        });

        client.ws.send(message);
        return true;
      } else {
        // Clean up closed connection
        this.clients.delete(clientId);
        return false;
      }

    } catch (error) {
      logger.error(`Error sending message to client ${clientId}:`, error);
      return false;
    }
  }

  broadcast(type, data, eventName = null) {
    try {
      let sentCount = 0;
      
      for (const [clientId, client] of this.clients) {
        // If eventName is specified, only send to subscribed clients
        if (eventName && client.subscriptions && !client.subscriptions.has(eventName)) {
          continue;
        }

        if (this.sendToClient(clientId, type, data)) {
          sentCount++;
        }
      }

      logger.debug(`Broadcast message sent to ${sentCount} clients`, { type, eventName });
      return sentCount;

    } catch (error) {
      logger.error('Error broadcasting message:', error);
      return 0;
    }
  }

  broadcastToUser(userId, type, data) {
    try {
      let sentCount = 0;
      
      for (const [clientId, client] of this.clients) {
        if (client.user.id === userId) {
          if (this.sendToClient(clientId, type, data)) {
            sentCount++;
          }
        }
      }

      return sentCount;

    } catch (error) {
      logger.error('Error broadcasting to user:', error);
      return 0;
    }
  }

  generateClientId() {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getStats() {
    const now = new Date();
    const clients = Array.from(this.clients.values());
    
    return {
      isInitialized: this.isInitialized,
      totalClients: this.clients.size,
      connectedClients: clients.filter(c => c.ws.readyState === WebSocket.OPEN).length,
      averageConnectionTime: clients.length > 0 
        ? Math.round(clients.reduce((sum, c) => sum + (now - c.connected), 0) / clients.length / 1000)
        : 0,
      clientDetails: clients.map(c => ({
        user: c.user.username,
        connected: c.connected,
        status: c.ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
        subscriptions: c.subscriptions ? Array.from(c.subscriptions) : []
      }))
    };
  }

  // Health check - ping all clients and remove dead connections
  async healthCheck() {
    try {
      const deadClients = [];
      
      for (const [clientId, client] of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          // Check if client responded to recent ping
          const timeSinceLastPing = Date.now() - client.lastPing.getTime();
          
          if (timeSinceLastPing > 60000) { // 1 minute
            // Send ping to check if client is alive
            client.ws.ping();
            
            // If no pong response for too long, mark as dead
            if (timeSinceLastPing > 120000) { // 2 minutes
              deadClients.push(clientId);
            }
          }
        } else {
          deadClients.push(clientId);
        }
      }

      // Remove dead clients
      deadClients.forEach(clientId => {
        this.handleDisconnection(clientId);
      });

      if (deadClients.length > 0) {
        logger.info(`Cleaned up ${deadClients.length} dead WebSocket connections`);
      }

    } catch (error) {
      logger.error('WebSocket health check error:', error);
    }
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

// Run health check every 5 minutes
setInterval(() => {
  websocketService.healthCheck();
}, 5 * 60 * 1000);

module.exports = websocketService;
