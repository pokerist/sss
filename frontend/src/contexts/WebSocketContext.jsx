import React, { createContext, useContext } from 'react'

const WebSocketContext = createContext()

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider')
  }
  return context
}

export const WebSocketProvider = ({ children }) => {
  // Dummy WebSocket context - does nothing
  const value = {
    isConnected: false,
    connectionStatus: 'disabled',
    subscribe: () => {},
    unsubscribe: () => {},
    reconnect: () => {},
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}
