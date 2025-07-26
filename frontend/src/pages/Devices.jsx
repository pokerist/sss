import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { devicesAPI, mediaAPI } from '../services/api'
import { Monitor, Search, Edit, Trash2, Power, Settings, X } from 'lucide-react'
import toast from 'react-hot-toast'

function StatusBadge({ status, isOnline }) {
  if (status === 'active') {
    return (
      <span className={`badge ${isOnline ? 'badge-default' : 'badge-secondary'}`}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    )
  }
  return <span className="badge badge-outline">Inactive</span>
}

function DeviceEditModal({ device, bundles, onClose, onSave }) {
  const [formData, setFormData] = useState({
    room_number: device?.room_number || '',
    assigned_bundle_id: device?.assigned_bundle_id || '',
    status: device?.status || 'inactive'
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Validation: don't allow active status without room number
    if (formData.status === 'active' && !formData.room_number.trim()) {
      toast.error('Room number is required for active devices')
      return
    }

    onSave(device.id, {
      room_number: formData.room_number.trim() || null,
      assigned_bundle_id: formData.assigned_bundle_id || null,
      status: formData.status
    })
  }

  if (!device) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Edit Device</h3>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Device ID
            </label>
            <input
              type="text"
              className="input w-full bg-gray-50"
              value={device.device_id}
              disabled
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Room Number *
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. 101"
              value={formData.room_number}
              onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Required for active devices
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Media Bundle
            </label>
            <select
              className="input w-full"
              value={formData.assigned_bundle_id}
              onChange={(e) => setFormData({ ...formData, assigned_bundle_id: e.target.value })}
            >
              <option value="">No bundle assigned</option>
              {bundles?.map((bundle) => (
                <option key={bundle.id} value={bundle.id}>
                  {bundle.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              className="input w-full"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="inactive">Inactive</option>
              <option value="active">Active</option>
            </select>
            {formData.status === 'active' && !formData.room_number.trim() && (
              <p className="text-xs text-red-500 mt-1">
                Room number is required for active status
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-md"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Devices() {
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    page: 1
  })
  
  const [editingDevice, setEditingDevice] = useState(null)
  
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery(
    ['devices', filters],
    () => devicesAPI.getDevices({
      search: filters.search,
      status: filters.status,
      page: filters.page,
      limit: 20
    }),
    {
      keepPreviousData: true
    }
  )

  const { data: bundlesData } = useQuery('media-bundles', mediaAPI.getBundles)

  const updateDeviceMutation = useMutation(
    ({ id, data }) => devicesAPI.updateDevice(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('devices')
        setEditingDevice(null)
        toast.success('Device updated successfully')
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Failed to update device')
      }
    }
  )

  const deleteDeviceMutation = useMutation(
    (id) => devicesAPI.deleteDevice(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('devices')
        toast.success('Device deleted successfully')
      }
    }
  )

  const handleStatusToggle = (device) => {
    // Don't allow activation without room number
    if (device.status === 'inactive' && !device.room_number) {
      toast.error('Please assign a room number before activating this device')
      setEditingDevice(device)
      return
    }

    const newStatus = device.status === 'active' ? 'inactive' : 'active'
    updateDeviceMutation.mutate({
      id: device.id,
      data: { status: newStatus }
    })
  }

  const handleEdit = (device) => {
    setEditingDevice(device)
  }

  const handleSaveEdit = (deviceId, data) => {
    updateDeviceMutation.mutate({ id: deviceId, data })
  }

  const handleDelete = (device) => {
    if (confirm(`Are you sure you want to delete device ${device.device_id}?`)) {
      deleteDeviceMutation.mutate(device.id)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="h-6 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <div className="card p-6 text-center text-red-600">
          Failed to load devices
        </div>
      </div>
    )
  }

  const devices = data?.data?.devices || []
  const pagination = data?.data?.pagination || {}
  const bundles = bundlesData?.data?.bundles || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <div className="text-sm text-gray-500">
          {pagination.total || 0} total devices
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search devices..."
                className="input pl-10"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              className="input"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {devices.map((device) => (
          <div key={device.id} className="card p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Monitor className="h-5 w-5 text-blue-600" />
                </div>
                <div className="ml-3">
                  <h3 className="font-medium text-gray-900">{device.device_id}</h3>
                  <p className="text-sm text-gray-500">
                    {device.room_number ? `Room ${device.room_number}` : 'No room assigned'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <StatusBadge status={device.status} isOnline={device.is_online} />
                
                {/* Status Toggle Button */}
                <button
                  onClick={() => handleStatusToggle(device)}
                  className={`btn btn-ghost btn-sm p-1 ${
                    device.status === 'active' ? 'text-red-600' : 'text-green-600'
                  }`}
                  disabled={updateDeviceMutation.isLoading}
                  title={device.status === 'active' ? 'Deactivate device' : 'Activate device'}
                >
                  <Power className="h-4 w-4" />
                </button>

                {/* Edit Button */}
                <button
                  onClick={() => handleEdit(device)}
                  className="btn btn-ghost btn-sm p-1"
                  title="Edit device"
                >
                  <Edit className="h-4 w-4" />
                </button>

                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(device)}
                  className="btn btn-ghost btn-sm p-1 text-red-600"
                  disabled={deleteDeviceMutation.isLoading}
                  title="Delete device"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Last sync:</span>
                <span>{device.last_sync ? new Date(device.last_sync).toLocaleDateString() : 'Never'}</span>
              </div>
              <div className="flex justify-between">
                <span>Bundle:</span>
                <span>{device.bundle_name || 'None'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {devices.length === 0 && (
        <div className="card p-12 text-center">
          <Monitor className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No devices found</h3>
          <p className="text-gray-500">
            {filters.search || filters.status ? 'Try adjusting your filters' : 'Devices will appear here when they register with the system'}
          </p>
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

      {/* Edit Modal */}
      {editingDevice && (
        <DeviceEditModal
          device={editingDevice}
          bundles={bundles}
          onClose={() => setEditingDevice(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  )
}

export default Devices
