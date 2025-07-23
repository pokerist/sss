import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { mediaAPI } from '../services/api'
import { Image, Plus, Upload, Trash2, Edit } from 'lucide-react'
import toast from 'react-hot-toast'

function MediaBundles() {
  const [selectedBundle, setSelectedBundle] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newBundleName, setNewBundleName] = useState('')
  
  const queryClient = useQueryClient()

  const { data: bundles, isLoading } = useQuery('media-bundles', mediaAPI.getBundles)

  const createBundleMutation = useMutation(
    (data) => mediaAPI.createBundle(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('media-bundles')
        setShowCreateModal(false)
        setNewBundleName('')
        toast.success('Media bundle created successfully')
      }
    }
  )

  const deleteBundleMutation = useMutation(
    (id) => mediaAPI.deleteBundle(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('media-bundles')
        toast.success('Media bundle deleted successfully')
      }
    }
  )

  const handleCreateBundle = (e) => {
    e.preventDefault()
    if (!newBundleName.trim()) return
    
    createBundleMutation.mutate({ name: newBundleName })
  }

  const handleDeleteBundle = (bundle) => {
    if (confirm(`Are you sure you want to delete bundle "${bundle.name}"?`)) {
      deleteBundleMutation.mutate(bundle.id)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Media Bundles</h1>
        </div>
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6">
              <div className="h-6 bg-gray-200 rounded mb-4"></div>
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const bundlesList = bundles?.data?.bundles || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Media Bundles</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary btn-md"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Bundle
        </button>
      </div>

      {/* Bundles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {bundlesList.map((bundle) => (
          <div key={bundle.id} className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <Image className="h-5 w-5 text-purple-600" />
                </div>
                <div className="ml-3">
                  <h3 className="font-medium text-gray-900">{bundle.name}</h3>
                  {bundle.is_default && (
                    <span className="text-xs text-blue-600 font-medium">Default</span>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setSelectedBundle(bundle)}
                  className="btn btn-ghost btn-sm p-1"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteBundle(bundle)}
                  className="btn btn-ghost btn-sm p-1 text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Content:</span>
                <span>{bundle.content_count || 0} items</span>
              </div>
              <div className="flex justify-between">
                <span>Videos:</span>
                <span>{bundle.content_breakdown?.video || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Images:</span>
                <span>{bundle.content_breakdown?.image || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Assigned devices:</span>
                <span>{bundle.assigned_devices_count || 0}</span>
              </div>
            </div>
            
            <div className="mt-4">
              <button className="btn btn-secondary btn-sm w-full">
                <Upload className="h-4 w-4 mr-2" />
                Upload Content
              </button>
            </div>
          </div>
        ))}
      </div>

      {bundlesList.length === 0 && (
        <div className="card p-12 text-center">
          <Image className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No media bundles</h3>
          <p className="text-gray-500 mb-4">Create your first media bundle to organize content</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary btn-md"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Bundle
          </button>
        </div>
      )}

      {/* Create Bundle Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create Media Bundle</h3>
            <form onSubmit={handleCreateBundle}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bundle Name
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Enter bundle name"
                  value={newBundleName}
                  onChange={(e) => setNewBundleName(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary btn-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createBundleMutation.isLoading}
                  className="btn btn-primary btn-md"
                >
                  {createBundleMutation.isLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default MediaBundles
