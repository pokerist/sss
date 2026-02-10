import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { mediaAPI } from '../services/api'
import { Image, Plus, Upload, Trash2, Edit, X, Eye } from 'lucide-react'
import toast from 'react-hot-toast'

function BundleEditModal({ bundle, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: bundle?.name || '',
    is_default: bundle?.is_default || false
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('Bundle name is required')
      return
    }
    onSave(bundle.id, formData)
  }

  if (!bundle) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Edit Bundle</h3>
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
              Bundle Name *
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="Enter bundle name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_default"
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
            />
            <label htmlFor="is_default" className="ml-2 block text-sm text-gray-900">
              Set as default bundle
            </label>
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

function UploadModal({ bundle, onClose, onUpload }) {
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    const validFiles = files.filter(file => 
      file.type.startsWith('image/') || file.type.startsWith('video/')
    )
    
    if (validFiles.length !== files.length) {
      toast.error('Only image and video files are allowed')
    }
    
    setSelectedFiles(validFiles)
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select files to upload')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      selectedFiles.forEach(file => {
        formData.append('files', file)
      })

      await onUpload(bundle.id, formData)
      onClose()
    } catch (error) {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (!bundle) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Upload Content to "{bundle.name}"</h3>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Files
            </label>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Select multiple images and videos. Max 10 files.
            </p>
          </div>

          {selectedFiles.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Files:</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="truncate">{file.name}</span>
                    <span className="text-gray-500 ml-2">
                      {(file.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-md"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || selectedFiles.length === 0}
              className="btn btn-primary btn-md"
            >
              {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ContentViewModal({ bundle, onClose }) {
  const { data: content, isLoading } = useQuery(
    ['bundle-content', bundle?.id],
    () => mediaAPI.getBundleContent(bundle.id),
    {
      enabled: !!bundle
    }
  )

  if (!bundle) return null

  const contentList = content?.data?.content || []

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Content in "{bundle.name}"</h3>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : contentList.length === 0 ? (
          <div className="text-center py-8">
            <Image className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No content in this bundle yet</p>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[70vh]">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {contentList.map((item) => (
                <div key={item.id} className="border rounded-lg overflow-hidden">
                  <div className="aspect-square bg-gray-100 flex items-center justify-center">
                    {item.type === 'image' ? (
                      <img
                        src={item.content_url}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-gray-500">
                        <svg className="h-8 w-8 mb-2" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM10 15.5v-7l6 3.5-6 3.5z"/>
                        </svg>
                        <span className="text-xs">Video</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-gray-900 truncate" title={item.title}>
                      {item.title}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{item.type}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="btn btn-secondary btn-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function MediaBundles() {
  const [selectedBundle, setSelectedBundle] = useState(null)
  const [uploadingBundle, setUploadingBundle] = useState(null)
  const [viewingBundle, setViewingBundle] = useState(null)
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

  const updateBundleMutation = useMutation(
    ({ id, data }) => mediaAPI.updateBundle(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('media-bundles')
        setSelectedBundle(null)
        toast.success('Bundle updated successfully')
      }
    }
  )

  const uploadContentMutation = useMutation(
    ({ id, formData }) => mediaAPI.uploadContent(id, formData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('media-bundles')
        setUploadingBundle(null)
        toast.success('Content uploaded successfully')
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

  const handleEditBundle = (bundle) => {
    setSelectedBundle(bundle)
  }

  const handleSaveEdit = (bundleId, data) => {
    updateBundleMutation.mutate({ id: bundleId, data })
  }

  const handleUploadContent = (bundle) => {
    setUploadingBundle(bundle)
  }

  const handleUpload = async (bundleId, formData) => {
    return uploadContentMutation.mutateAsync({ id: bundleId, formData })
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
          <h1 className="text-2xl font-bold text-gray-900">Manage Screen Savers and Default Background for Launcher</h1>
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
        <h1 className="text-2xl font-bold text-gray-900">Manage Screen Savers and Default Background for Launcher</h1>
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
                  onClick={() => handleEditBundle(bundle)}
                  className="btn btn-ghost btn-sm p-1"
                  title="Edit bundle"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteBundle(bundle)}
                  className="btn btn-ghost btn-sm p-1 text-red-600"
                  title="Delete bundle"
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
            
            <div className="mt-4 space-y-2">
              <button 
                onClick={() => setViewingBundle(bundle)}
                className="btn btn-ghost btn-sm w-full"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Content ({bundle.content_count || 0})
              </button>
              <button 
                onClick={() => handleUploadContent(bundle)}
                className="btn btn-secondary btn-sm w-full"
              >
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

      {/* Edit Bundle Modal */}
      {selectedBundle && (
        <BundleEditModal
          bundle={selectedBundle}
          onClose={() => setSelectedBundle(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Upload Modal */}
      {uploadingBundle && (
        <UploadModal
          bundle={uploadingBundle}
          onClose={() => setUploadingBundle(null)}
          onUpload={handleUpload}
        />
      )}

      {/* Content View Modal */}
      {viewingBundle && (
        <ContentViewModal
          bundle={viewingBundle}
          onClose={() => setViewingBundle(null)}
        />
      )}
    </div>
  )
}

export default MediaBundles
