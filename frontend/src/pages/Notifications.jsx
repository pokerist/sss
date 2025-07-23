import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { notificationsAPI } from '../services/api'
import { Bell, Plus, Send, Search, Filter, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

function StatusBadge({ status }) {
  const statusConfig = {
    new: { color: 'bg-blue-100 text-blue-800', text: 'New' },
    sent: { color: 'bg-green-100 text-green-800', text: 'Sent' },
    viewed: { color: 'bg-purple-100 text-purple-800', text: 'Viewed' },
    dismissed: { color: 'bg-gray-100 text-gray-800', text: 'Dismissed' }
  }
  
  const config = statusConfig[status] || statusConfig.new
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.text}
    </span>
  )
}

function TypeBadge({ type }) {
  const typeConfig = {
    manual: { color: 'bg-gray-100 text-gray-800', text: 'Manual' },
    welcome: { color: 'bg-green-100 text-green-800', text: 'Welcome' },
    farewell: { color: 'bg-orange-100 text-orange-800', text: 'Farewell' },
    system: { color: 'bg-red-100 text-red-800', text: 'System' }
  }
  
  const config = typeConfig[type] || typeConfig.manual
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.text}
    </span>
  )
}

function Notifications() {
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    type: '',
    page: 1
  })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newNotification, setNewNotification] = useState({
    title: '',
    body: '',
    room_number: '',
    schedule_for: ''
  })
  
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery(
    ['notifications', filters],
    () => notificationsAPI.getNotifications({
      search: filters.search,
      status: filters.status,
      notification_type: filters.type,
      page: filters.page,
      limit: 20
    }),
    {
      keepPreviousData: true
    }
  )

  const createNotificationMutation = useMutation(
    (data) => notificationsAPI.createNotification(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('notifications')
        setShowCreateModal(false)
        setNewNotification({ title: '', body: '', room_number: '', schedule_for: '' })
        toast.success('Notification created successfully')
      }
    }
  )

  const deleteNotificationMutation = useMutation(
    (id) => notificationsAPI.deleteNotification(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('notifications')
        toast.success('Notification deleted successfully')
      }
    }
  )

  const handleCreateNotification = (e) => {
    e.preventDefault()
    
    const payload = {
      ...newNotification,
      schedule_for: newNotification.schedule_for || null
    }
    
    createNotificationMutation.mutate(payload)
  }

  const handleDeleteNotification = (notification) => {
    if (confirm(`Are you sure you want to delete this notification?`)) {
      deleteNotificationMutation.mutate(notification.id)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const notifications = data?.data?.notifications || []
  const pagination = data?.data?.pagination || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary btn-md"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Notification
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search notifications..."
                className="input pl-10"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
              />
            </div>
          </div>
          <div className="lg:w-48">
            <select
              className="input"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            >
              <option value="">All Status</option>
              <option value="new">New</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
          <div className="lg:w-48">
            <select
              className="input"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
            >
              <option value="">All Types</option>
              <option value="manual">Manual</option>
              <option value="welcome">Welcome</option>
              <option value="farewell">Farewell</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {notifications.map((notification) => (
          <div key={notification.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="font-medium text-gray-900">{notification.title}</h3>
                  <StatusBadge status={notification.status} />
                  <TypeBadge type={notification.notification_type} />
                </div>
                <p className="text-gray-600 mb-2">{notification.body}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span>Room: {notification.room_number || 'N/A'}</span>
                  {notification.guest_name && (
                    <span>Guest: {notification.guest_name}</span>
                  )}
                  <span>Created: {format(new Date(notification.created_at), 'MMM dd, yyyy HH:mm')}</span>
                  {notification.scheduled_for && (
                    <span>Scheduled: {format(new Date(notification.scheduled_for), 'MMM dd, yyyy HH:mm')}</span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDeleteNotification(notification)}
                  className="btn btn-ghost btn-sm p-1 text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {notifications.length === 0 && (
        <div className="card p-12 text-center">
          <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications found</h3>
          <p className="text-gray-500 mb-4">
            {filters.search || filters.status || filters.type ? 'Try adjusting your filters' : 'Create your first notification'}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary btn-md"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Notification
          </button>
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center">
          <div className="flex space-x-2">
            {[...Array(pagination.pages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setFilters({ ...filters, page: i + 1 })}
                className={`btn btn-sm ${
                  pagination.page === i + 1 ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create Notification Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create Notification</h3>
            <form onSubmit={handleCreateNotification} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Notification title"
                  value={newNotification.title}
                  onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message *
                </label>
                <textarea
                  className="input w-full h-24 resize-none"
                  placeholder="Notification message"
                  value={newNotification.body}
                  onChange={(e) => setNewNotification({ ...newNotification, body: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Room Number (optional)
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="e.g. 101"
                  value={newNotification.room_number}
                  onChange={(e) => setNewNotification({ ...newNotification, room_number: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to send to all active devices
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Schedule For (optional)
                </label>
                <input
                  type="datetime-local"
                  className="input w-full"
                  value={newNotification.schedule_for}
                  onChange={(e) => setNewNotification({ ...newNotification, schedule_for: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to send immediately
                </p>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary btn-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createNotificationMutation.isLoading}
                  className="btn btn-primary btn-md"
                >
                  {createNotificationMutation.isLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Notifications
