import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuthContext } from './AuthContext'
import toast from 'react-hot-toast'

const WebSocketContext = createContext()

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider')
  }
  return context
}

export const WebSocketProvider = ({ children }) => {
  const { user } = useAuthContext()
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const ws = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const connect = () => {
    if (!user || !localStorage.getItem('token')) {
      return
    }

    try {
      const token = localStorage.getItem('token')
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
      
      setConnectionStatus('connecting')
      ws.current = new WebSocket(wsUrl)

      ws.current.onopen = () => {
        console.log('WebSocket connected')
        setIsConnected(true)
        setConnectionStatus('connected')
        reconnectAttempts.current = 0
        
        // Subscribe to all events by default
        subscribe(['device_registered', 'device_updated', 'notification_created', 'bundle_created'])
      }

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason)
        setIsConnected(false)
        setConnectionStatus('disconnected')
        
        // Only attempt to reconnect if it wasn't a manual close
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          scheduleReconnect()
        }
      }

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnectionStatus('error')
      }

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      setConnectionStatus('error')
    }
  }

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (ws.current) {
      ws.current.close(1000, 'Manual disconnect')
      ws.current = null
    }
    
    setIsConnected(false)
    setConnectionStatus('disconnected')
  }

  const scheduleReconnect = () => {
    if (reconnectTimeoutRef.current) {
      return
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
    reconnectAttempts.current++
    
    setConnectionStatus('reconnecting')
    
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null
      connect()
    }, delay)
  }

  const subscribe = (events) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'subscribe',
        data: { events }
      }))
    }
  }

  const unsubscribe = (events) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'unsubscribe',
        data: { events }
      }))
    }
  }

  const handleMessage = (message) => {
    const { type, data } = message

    switch (type) {
      case 'connection_established':
        console.log('WebSocket connection established:', data.clientId)
        break

      case 'device_registered':
        toast.success(`New device registered: ${data.device_id}`)
        // Trigger refresh of devices list if needed
        window.dispatchEvent(new CustomEvent('refresh-devices'))
        break

      case 'device_updated':
        toast.info(`Device updated: ${data.device.device_id}`)
        window.dispatchEvent(new CustomEvent('refresh-devices'))
        break

      case 'device_deleted':
        toast.info(`Device deleted: ${data.device_id}`)
        window.dispatchEvent(new CustomEvent('refresh-devices'))
        break

      case 'notification_created':
        toast.success('New notification created')
        window.dispatchEvent(new CustomEvent('refresh-notifications'))
        break

      case 'notification_generated':
        const notifyType = data.type === 'welcome' ? 'Welcome' : 'Farewell'
        toast.success(`${notifyType} notification generated automatically`)
        window.dispatchEvent(new CustomEvent('refresh-notifications'))
        break

      case 'bundle_created':
        toast.success(`Media bundle created: ${data.bundle.name}`)
        window.dispatchEvent(new CustomEvent('refresh-bundles'))
        break

      case 'bundle_updated':
        toast.info(`Media bundle updated: ${data.bundle.name}`)
        window.dispatchEvent(new CustomEvent('refresh-bundles'))
        break

      case 'bundle_deleted':
        toast.info(`Media bundle deleted: ${data.bundle_name}`)
        window.dispatchEvent(new CustomEvent('refresh-bundles'))
        break

      case 'app_created':
        toast.success(`App added: ${data.app.name}`)
        window.dispatchEvent(new CustomEvent('refresh-apps'))
        break

      case 'app_updated':
        toast.info(`App updated: ${data.app.name}`)
        window.dispatchEvent(new CustomEvent('refresh-apps'))
        break

      case 'app_deleted':
        toast.info(`App deleted: ${data.app_name}`)
        window.dispatchEvent(new CustomEvent('refresh-apps'))
        break

      case 'bulk_notification_sent':
        toast.success(`Bulk notification sent to ${data.count} devices`)
        window.dispatchEvent(new CustomEvent('refresh-notifications'))
        break

      case 'scheduled_notifications_processed':
        if (data.count > 0) {
          toast.info(`${data.count} scheduled notifications processed`)
          window.dispatchEvent(new CustomEvent('refresh-notifications'))
        }
        break

      case 'pong':
        // Handle ping/pong for connection health
        break

      case 'error':
        console.error('WebSocket error message:', data.error)
        break

      default:
        console.log('Unknown WebSocket message type:', type, data)
    }
  }

  // Send ping every 30 seconds to keep connection alive
  useEffect(() => {
    if (!isConnected) return

    const pingInterval = setInterval(() => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    return () => clearInterval(pingInterval)
  }, [isConnected])

  // Connect when user is available
  useEffect(() => {
    if (user) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [user])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [])

  const value = {
    isConnected,
    connectionStatus,
    subscribe,
    unsubscribe,
    reconnect: connect,
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}
