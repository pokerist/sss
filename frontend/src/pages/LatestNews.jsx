import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { newsAPI } from '../services/api'
import { Plus, Image, Link2, GripVertical, Trash2, Edit } from 'lucide-react'
import toast from 'react-hot-toast'

function LatestNews() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingNews, setEditingNews] = useState(null)
  const [newNews, setNewNews] = useState({
    title: '',
    paragraph: '',
    link: '',
    is_active: true
  })
  const [selectedImage, setSelectedImage] = useState(null)
  
  const queryClient = useQueryClient()

  const { data: news, isLoading } = useQuery('news', newsAPI.getNews)

  const createNewsMutation = useMutation(
    (formData) => newsAPI.createNews(formData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('news')
        setShowCreateModal(false)
        setNewNews({ title: '', paragraph: '', link: '', is_active: true })
        setSelectedImage(null)
        toast.success('News item added successfully')
      }
    }
  )

  const updateNewsMutation = useMutation(
    ({ id, formData }) => newsAPI.updateNews(id, formData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('news')
        setShowEditModal(false)
        setEditingNews(null)
        setSelectedImage(null)
        toast.success('News item updated successfully')
      }
    }
  )

  const deleteNewsMutation = useMutation(
    (id) => newsAPI.deleteNews(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('news')
        toast.success('News item deleted successfully')
      }
    }
  )

  const reorderNewsMutation = useMutation(
    (orders) => newsAPI.reorderNews(orders),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('news')
        toast.success('News order updated successfully')
      }
    }
  )

  const handleCreateNews = (e) => {
    e.preventDefault()
    
    const formData = new FormData()
    formData.append('title', newNews.title)
    formData.append('paragraph', newNews.paragraph)
    formData.append('link', newNews.link)
    formData.append('is_active', newNews.is_active)
    
    if (selectedImage) {
      formData.append('image', selectedImage)
    }
    
    createNewsMutation.mutate(formData)
  }

  const handleUpdateNews = (e) => {
    e.preventDefault()
    
    const formData = new FormData()
    formData.append('title', editingNews.title)
    formData.append('paragraph', editingNews.paragraph)
    formData.append('link', editingNews.link)
    formData.append('is_active', editingNews.is_active)
    
    if (selectedImage) {
      formData.append('image', selectedImage)
    }
    
    updateNewsMutation.mutate({ id: editingNews.id, formData })
  }

  const handleDeleteNews = (newsItem) => {
    if (confirm(`Are you sure you want to delete "${newsItem.title}"?`)) {
      deleteNewsMutation.mutate(newsItem.id)
    }
  }

  const handleDragEnd = (result) => {
    if (!result.destination) return

    const newsList = news?.data || []
    const reorderedNews = Array.from(newsList)
    const [reorderedItem] = reorderedNews.splice(result.source.index, 1)
    reorderedNews.splice(result.destination.index, 0, reorderedItem)

    // Update order_index for all affected news items
    const orders = reorderedNews.map((item, index) => ({
      id: item.id,
      order_index: index
    }))

    reorderNewsMutation.mutate(orders)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Latest News</h1>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center space-x-4">
                <div className="h-20 w-20 bg-gray-200 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const newsList = news?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Latest News</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary btn-md"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add News
        </button>
      </div>

      {/* News List */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="news">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-4"
            >
              {newsList.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id.toString()} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="card p-4"
                    >
                      <div className="flex items-center space-x-4">
                        <div {...provided.dragHandleProps} className="cursor-move">
                          <GripVertical className="h-5 w-5 text-gray-400" />
                        </div>
                        
                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.title}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <Image className="h-8 w-8 text-gray-400" />
                          )}
                        </div>
                        
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{item.title}</h3>
                          <p className="text-sm text-gray-500 line-clamp-2">{item.paragraph}</p>
                          {item.link && (
                            <div className="flex items-center mt-1 text-sm text-blue-600">
                              <Link2 className="h-3 w-3 mr-1" />
                              {item.link}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setEditingNews(item)
                              setShowEditModal(true)
                            }}
                            className="btn btn-ghost btn-sm p-1 text-blue-600"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          
                          <button
                            onClick={() => handleDeleteNews(item)}
                            className="btn btn-ghost btn-sm p-1 text-red-600"
                            disabled={deleteNewsMutation.isLoading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {newsList.length === 0 && (
        <div className="card p-12 text-center">
          <Image className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No news items</h3>
          <p className="text-gray-500 mb-4">Add news items to display on TV devices</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary btn-md"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add First News Item
          </button>
        </div>
      )}

      {/* Create News Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add News Item</h3>
            <form onSubmit={handleCreateNews} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  className="input w-full"
                  value={newNews.title}
                  onChange={(e) => setNewNews({ ...newNews, title: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paragraph
                </label>
                <textarea
                  className="input w-full h-24"
                  value={newNews.paragraph}
                  onChange={(e) => setNewNews({ ...newNews, paragraph: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Link
                </label>
                <input
                  type="url"
                  className="input w-full"
                  placeholder="https://..."
                  value={newNews.link}
                  onChange={(e) => setNewNews({ ...newNews, link: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="input w-full"
                  onChange={(e) => setSelectedImage(e.target.files[0])}
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  className="form-checkbox h-4 w-4 text-blue-600"
                  checked={newNews.is_active}
                  onChange={(e) => setNewNews({ ...newNews, is_active: e.target.checked })}
                />
                <label htmlFor="is_active" className="ml-2 text-sm text-gray-600">
                  Active
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
                  disabled={createNewsMutation.isLoading}
                  className="btn btn-primary btn-md"
                >
                  {createNewsMutation.isLoading ? 'Adding...' : 'Add News'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit News Modal */}
      {showEditModal && editingNews && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Edit News Item</h3>
            <form onSubmit={handleUpdateNews} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  className="input w-full"
                  value={editingNews.title}
                  onChange={(e) => setEditingNews({ ...editingNews, title: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paragraph
                </label>
                <textarea
                  className="input w-full h-24"
                  value={editingNews.paragraph}
                  onChange={(e) => setEditingNews({ ...editingNews, paragraph: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Link
                </label>
                <input
                  type="url"
                  className="input w-full"
                  placeholder="https://..."
                  value={editingNews.link}
                  onChange={(e) => setEditingNews({ ...editingNews, link: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="input w-full"
                  onChange={(e) => setSelectedImage(e.target.files[0])}
                />
                {editingNews.image_url && (
                  <div className="mt-2">
                    <img
                      src={editingNews.image_url}
                      alt={editingNews.title}
                      className="h-20 w-20 object-cover rounded"
                    />
                  </div>
                )}
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="edit_is_active"
                  className="form-checkbox h-4 w-4 text-blue-600"
                  checked={editingNews.is_active}
                  onChange={(e) => setEditingNews({ ...editingNews, is_active: e.target.checked })}
                />
                <label htmlFor="edit_is_active" className="ml-2 text-sm text-gray-600">
                  Active
                </label>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingNews(null)
                  }}
                  className="btn btn-secondary btn-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateNewsMutation.isLoading}
                  className="btn btn-primary btn-md"
                >
                  {updateNewsMutation.isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default LatestNews
