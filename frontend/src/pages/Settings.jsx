import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { settingsAPI } from '../services/api'
import { useAuthContext } from '../contexts/AuthContext'
import { 
  Settings as SettingsIcon, 
  Upload, 
  TestTube, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Lock,
  Server,
  Image
} from 'lucide-react'
import toast from 'react-hot-toast'

function ConnectionStatusBadge({ status, testResult }) {
  if (testResult) {
    return testResult.success ? (
      <div className="flex items-center text-green-600">
        <CheckCircle className="h-4 w-4 mr-1" />
        <span className="text-sm">Connected</span>
      </div>
    ) : (
      <div className="flex items-center text-red-600">
        <XCircle className="h-4 w-4 mr-1" />
        <span className="text-sm">Failed</span>
      </div>
    )
  }

  const statusConfig = {
    connected: { icon: CheckCircle, color: 'text-green-600', text: 'Connected' },
    disconnected: { icon: XCircle, color: 'text-red-600', text: 'Disconnected' },
    error: { icon: XCircle, color: 'text-red-600', text: 'Error' }
  }

  const config = statusConfig[status] || statusConfig.disconnected
  const Icon = config.icon

  return (
    <div className={`flex items-center ${config.color}`}>
      <Icon className="h-4 w-4 mr-1" />
      <span className="text-sm">{config.text}</span>
    </div>
  )
}

function Settings() {
  const { changePassword } = useAuthContext()
  const [activeTab, setActiveTab] = useState('hotel')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [pmsTestResult, setPmsTestResult] = useState(null)
  const [formData, setFormData] = useState({
    hotel_name: '',
    main_message: '',
    footer_credit: '',
    pms_base_url: '',
    pms_api_key: '',
    pms_username: '',
    pms_password: ''
  })

  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery('system-settings', settingsAPI.getSystemSettings, {
    onSuccess: (data) => {
      const systemSettings = data?.settings || {}
      setFormData({
        hotel_name: systemSettings.hotel_name || '',
        main_message: systemSettings.main_message || '',
        footer_credit: systemSettings.footer_credit || '',
        pms_base_url: systemSettings.pms_base_url || '',
        pms_api_key: systemSettings.pms_api_key || '',
        pms_username: systemSettings.pms_username || '',
        pms_password: '',
        hotel_logo_url: systemSettings.hotel_logo_url || ''
      })
    }
  })

  const updateSettingsMutation = useMutation(
    (formData) => settingsAPI.updateSystemSettings(formData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('system-settings')
        toast.success('Settings updated successfully')
      }
    }
  )

  const testPMSMutation = useMutation(
    (data) => settingsAPI.testPMSConnection(data),
    {
      onSuccess: (response) => {
        setPmsTestResult(response.data)
        if (response.data.success) {
          toast.success('PMS connection successful')
        } else {
          toast.error(`PMS connection failed: ${response.data.error}`)
        }
      }
    }
  )

  const forceSyncMutation = useMutation(
    () => settingsAPI.forcePMSSync(),
    {
      onSuccess: (response) => {
        if (response.data.success) {
          toast.success('PMS sync completed successfully')
        } else {
          toast.error(`PMS sync failed: ${response.data.error}`)
        }
      }
    }
  )

  const handleHotelSettingsSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    updateSettingsMutation.mutate(formData)
  }

  const handlePMSSettingsSubmit = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    updateSettingsMutation.mutate(formData)
  }

  const handleTestPMSConnection = (e) => {
    e.preventDefault()
    const formData = new FormData(e.target.form)
    const testData = {
      pms_base_url: formData.get('pms_base_url'),
      pms_api_key: formData.get('pms_api_key'),
      pms_username: formData.get('pms_username'),
      pms_password: formData.get('pms_password')
    }
    testPMSMutation.mutate(testData)
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    const result = await changePassword({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword
    })

    if (result.success) {
      setShowPasswordModal(false)
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        </div>
        <div className="animate-pulse">
          <div className="card p-6">
            <div className="h-6 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const systemSettings = settings?.settings || {}

  const tabs = [
    { id: 'hotel', name: 'Hotel Information', icon: Image },
    { id: 'pms', name: 'PMS Integration', icon: Server },
    { id: 'security', name: 'Security', icon: Lock }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {tab.name}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Hotel Information Tab */}
      {activeTab === 'hotel' && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Hotel Information</h3>
          <form onSubmit={handleHotelSettingsSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hotel Name
              </label>
              <input
                type="text"
                name="hotel_name"
                className="input w-full"
                value={formData.hotel_name}
                onChange={(e) => setFormData({ ...formData, hotel_name: e.target.value })}
                placeholder="Enter hotel name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Main Message
              </label>
              <textarea
                name="main_message"
                className="input w-full h-24"
                value={formData.main_message}
                onChange={(e) => setFormData({ ...formData, main_message: e.target.value })}
                placeholder="Enter main message to display on TV devices"
              />
              <p className="text-xs text-gray-500 mt-1">
                This message will be displayed prominently on TV devices
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Footer Credit
              </label>
              <input
                type="text"
                name="footer_credit"
                className="input w-full"
                value={formData.footer_credit}
                onChange={(e) => setFormData({ ...formData, footer_credit: e.target.value })}
                placeholder="Enter footer credit text"
              />
              <p className="text-xs text-gray-500 mt-1">
                This text will appear in the footer of TV devices
              </p>
            </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hotel Logo
                </label>
                <div className="flex items-center space-x-4">
                  {formData.hotel_logo_url && (
                    <div className="relative">
                      <img
                        src={formData.hotel_logo_url}
                        alt="Hotel Logo"
                        className="h-16 w-16 object-contain border rounded"
                      />
                      <p className="text-xs text-gray-500 mt-1 break-all">
                        Current: {formData.hotel_logo_url}
                      </p>
                    </div>
                  )}
                  <input
                    type="file"
                    name="hotel_logo"
                    accept="image/*"
                    className="input flex-1"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        // Preview the new image
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setFormData(prev => ({
                            ...prev,
                            hotel_logo_preview: reader.result
                          }));
                        };
                        reader.readAsDataURL(e.target.files[0]);
                      }
                    }}
                  />
                </div>
                {formData.hotel_logo_preview && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700">New Logo Preview:</p>
                    <img
                      src={formData.hotel_logo_preview}
                      alt="New Logo Preview"
                      className="h-16 w-16 object-contain border rounded mt-1"
                    />
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Upload a logo image for your hotel
                </p>
              </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={updateSettingsMutation.isLoading}
                className="btn btn-primary btn-md"
              >
                {updateSettingsMutation.isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PMS Integration Tab */}
      {activeTab === 'pms' && (
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">PMS Integration</h3>
              <div className="flex items-center space-x-4">
                <ConnectionStatusBadge 
                  status={systemSettings.pms_connection_status} 
                  testResult={pmsTestResult}
                />
                <button
                  onClick={() => forceSyncMutation.mutate()}
                  disabled={forceSyncMutation.isLoading}
                  className="btn btn-secondary btn-sm"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${forceSyncMutation.isLoading ? 'animate-spin' : ''}`} />
                  Force Sync
                </button>
              </div>
            </div>

            <form onSubmit={handlePMSSettingsSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PMS Base URL
                </label>
                <input
                  type="url"
                  name="pms_base_url"
                  className="input w-full"
                  value={formData.pms_base_url}
                  onChange={(e) => setFormData({ ...formData, pms_base_url: e.target.value })}
                  placeholder="https://your-opera-cloud.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type="text"
                  name="pms_api_key"
                  className="input w-full"
                  value={formData.pms_api_key}
                  onChange={(e) => setFormData({ ...formData, pms_api_key: e.target.value })}
                  placeholder="Enter API key"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    name="pms_username"
                    className="input w-full"
                    value={formData.pms_username}
                    onChange={(e) => setFormData({ ...formData, pms_username: e.target.value })}
                    placeholder="API username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    name="pms_password"
                    className="input w-full"
                    value={formData.pms_password}
                    onChange={(e) => setFormData({ ...formData, pms_password: e.target.value })}
                    placeholder="API password"
                  />
                </div>
              </div>

              {pmsTestResult && (
                <div className={`p-4 rounded-md ${
                  pmsTestResult.success 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex">
                    {pmsTestResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )}
                    <div className="ml-3">
                      <h3 className={`text-sm font-medium ${
                        pmsTestResult.success ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {pmsTestResult.success ? 'Connection Successful' : 'Connection Failed'}
                      </h3>
                      <div className={`mt-2 text-sm ${
                        pmsTestResult.success ? 'text-green-700' : 'text-red-700'
                      }`}>
                        <p>{pmsTestResult.success ? 'PMS connection is working correctly' : pmsTestResult.error}</p>
                        {pmsTestResult.details && (
                          <p className="mt-1 text-xs">{pmsTestResult.details}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={handleTestPMSConnection}
                  disabled={testPMSMutation.isLoading}
                  className="btn btn-secondary btn-md"
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  {testPMSMutation.isLoading ? 'Testing...' : 'Test Connection'}
                </button>

                <button
                  type="submit"
                  disabled={updateSettingsMutation.isLoading}
                  className="btn btn-primary btn-md"
                >
                  {updateSettingsMutation.isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Security Settings</h3>
          
          <div className="space-y-6">
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-2">Admin Account</h4>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Administrator</p>
                  <p className="text-sm text-gray-500">Change your admin password</p>
                </div>
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="btn btn-secondary btn-sm"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Change Password
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-md font-medium text-gray-900 mb-2">System Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-700">Admin Username</p>
                  <p className="text-gray-600">{systemSettings.admin_username}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-700">Last Updated</p>
                  <p className="text-gray-600">
                    {systemSettings.updated_at 
                      ? new Date(systemSettings.updated_at).toLocaleDateString()
                      : 'Never'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Change Password</h3>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  className="input w-full"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  className="input w-full"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  className="input w-full"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  required
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="btn btn-secondary btn-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-md"
                >
                  Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
