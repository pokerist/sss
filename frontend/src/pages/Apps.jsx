import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { appsAPI } from '../services/api'
import { Smartphone, Plus, Upload, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

function Apps() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newApp, setNewApp] = useState({
    name: '',
    package_name: '',
    is_allowed: true
  })
  const [selectedFiles, setSelectedFiles] = useState({
    apk: null,
    logo: null
  })
  
  const queryClient = useQueryClient()

  const { data: apps, isLoading } = useQuery('apps', appsAPI.getApps)

  const createAppMutation = useMutation(
    (formData) => appsAPI.createApp(formData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('apps')
        setShowCreateModal(false)
        setNewApp({ name: '', package_name: '', is_allowed: true })
        setSelectedFiles({ apk: null, logo: null })
        toast.success('App added successfully')
      }
    }
  )

  const deleteAppMutation = useMutation(
    (id) => appsAPI.deleteApp(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('apps')
        toast.success('App deleted successfully')
      }
    }
  )

  const toggleAppMutation = useMutation(
    ({ id, is_allowed }) => {
      const formData = new FormData()
      formData.append('is_allowed', is_allowed)
      return appsAPI.updateApp(id, formData)
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('apps')
        toast.success('App updated successfully')
      }
    }
  )

  const handleCreateApp = (e) => {
    e.preventDefault()
    
    const formData = new FormData()
    formData.append('name', newApp.name)
    formData.append('package_name', newApp.package_name)
    formData.append('is_allowed', newApp.is_allowed)
    
    if (selectedFiles.apk) {
      formData.append('apk', selectedFiles.apk)
    }
    
    if (selectedFiles.logo) {
      formData.append('logo', selectedFiles.logo)
    }
    
    createAppMutation.mutate(formData)
  }

  const handleDeleteApp = (app) => {
    if (confirm(`Are you sure you want to delete "${app.name}"?`)) {
      deleteAppMutation.mutate(app.id)
    }
  }

  const handleToggleApp = (app) => {
    toggleAppMutation.mutate({
      id: app.id,
      is_allowed: !app.is_allowed
    })
  }

  const handleFileChange = (type, file) => {
    setSelectedFiles({
      ...selectedFiles,
      [type]: file
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Apps Management</h1>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-gray-200 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const appsList = apps?.data?.apps || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Apps Management</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary btn-md"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add App
        </button>
      </div>

      {/* Apps List */}
      <div className="space-y-4">
        {appsList.map((app) => (
          <div key={app.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    {app.app_logo_url ? (
                      <img
                        src={app.app_logo_url}
                        alt={app.name}
                        className="w-8 h-8 rounded"
                      />
                    ) : (
                      <Smartphone className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{app.name}</h3>
                  <p className="text-sm text-gray-500">{app.package_name}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-blue-600"
                      checked={app.is_allowed}
                      onChange={() => handleToggleApp(app)}
                    />
                    <span className="ml-2 text-sm text-gray-600">Allowed</span>
                  </label>
                </div>
                
                <button
                  onClick={() => handleDeleteApp(app)}
                  className="btn btn-ghost btn-sm p-1 text-red-600"
                  disabled={deleteAppMutation.isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {appsList.length === 0 && (
        <div className="card p-12 text-center">
          <Smartphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No apps configured</h3>
          <p className="text-gray-500 mb-4">Add apps that will be available on TV devices</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary btn-md"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add First App
          </button>
        </div>
      )}

      {/* Create App Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-screen overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add New App</h3>
            <form onSubmit={handleCreateApp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  App Name *
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="e.g. Netflix"
                  value={newApp.name}
                  onChange={(e) => setNewApp({ ...newApp, name: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Package Name *
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="e.g. com.netflix.mediaclient"
                  value={newApp.package_name}
                  onChange={(e) => setNewApp({ ...newApp, package_name: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  APK File (optional)
                </label>
                <input
                  type="file"
                  accept=".apk"
                  className="input w-full"
                  onChange={(e) => handleFileChange('apk', e.target.files[0])}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload APK file if app needs to be installed
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  App Logo (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="input w-full"
                  onChange={(e) => handleFileChange('logo', e.target.files[0])}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload logo image for the app
                </p>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_allowed"
                  className="form-checkbox h-4 w-4 text-blue-600"
                  checked={newApp.is_allowed}
                  onChange={(e) => setNewApp({ ...newApp, is_allowed: e.target.checked })}
                />
                <label htmlFor="is_allowed" className="ml-2 text-sm text-gray-600">
                  Allow app on devices
                </label>
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
                  disabled={createAppMutation.isLoading}
                  className="btn btn-primary btn-md"
                >
                  {createAppMutation.isLoading ? 'Adding...' : 'Add App'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Apps
