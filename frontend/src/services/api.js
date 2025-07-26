import axios from 'axios'
import toast from 'react-hot-toast'

// Create axios instance
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    
    const message = error.response?.data?.error || error.message || 'An error occurred'
    
    // Don't show toast for specific endpoints
    const silentEndpoints = ['/auth/login']
    const shouldShowToast = !silentEndpoints.some(endpoint => 
      error.config?.url?.includes(endpoint)
    )
    
    if (shouldShowToast) {
      toast.error(message)
    }
    
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  changePassword: (data) => api.post('/auth/change-password', data),
}

// Dashboard API
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getHealth: () => api.get('/dashboard/health'),
  getLogs: (params) => api.get('/dashboard/logs', { params }),
}

// Devices API
export const devicesAPI = {
  getDevices: (params) => api.get('/devices', { params }),
  updateDevice: (id, data) => api.put(`/devices/${id}`, data),
  deleteDevice: (id) => api.delete(`/devices/${id}`),
  bulkActions: (data) => api.post('/devices/bulk-actions', data),
}

// Media API
export const mediaAPI = {
  getBundles: () => api.get('/media/bundles'),
  createBundle: (data) => api.post('/media/bundles', data),
  updateBundle: (id, data) => api.put(`/media/bundles/${id}`, data),
  deleteBundle: (id) => api.delete(`/media/bundles/${id}`),
  getBundleContent: (id) => api.get(`/media/bundles/${id}/content`),
  uploadContent: (id, formData) => api.post(`/media/bundles/${id}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteContent: (id) => api.delete(`/media/content/${id}`),
  bulkDeleteBundles: (data) => api.post('/media/bundles/bulk-delete', data),
}

// Apps API
export const appsAPI = {
  getApps: () => api.get('/apps'),
  createApp: (formData) => api.post('/apps', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateApp: (id, formData) => api.put(`/apps/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteApp: (id) => api.delete(`/apps/${id}`),
  reorderApps: (data) => api.post('/apps/reorder', data),
  bulkDeleteApps: (data) => api.post('/apps/bulk-delete', data),
}

// Notifications API
export const notificationsAPI = {
  getNotifications: (params) => api.get('/notifications', { params }),
  createNotification: (data) => api.post('/notifications', data),
  updateNotificationStatus: (id, data) => api.put(`/notifications/${id}/status`, data),
  deleteNotification: (id) => api.delete(`/notifications/${id}`),
  bulkSend: (data) => api.post('/notifications/bulk-send', data),
  getStats: () => api.get('/notifications/stats'),
  cleanup: (data) => api.post('/notifications/cleanup', data),
}

// Settings API
export const settingsAPI = {
  getSystemSettings: () => api.get('/settings/system'),
  updateSystemSettings: (formData) => api.put('/settings/system', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  testPMSConnection: (data) => api.post('/settings/test-pms-connection', data),
  getPMSSyncStatus: () => api.get('/settings/pms-sync-status'),
  forcePMSSync: () => api.post('/settings/force-pms-sync'),
  initializeSystem: (data) => api.post('/settings/initialize', data),
}

export default api
