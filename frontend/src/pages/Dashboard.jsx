import React from 'react'
import { useQuery } from 'react-query'
import { dashboardAPI } from '../services/api'
import { 
  Monitor, 
  Users, 
  Image, 
  Bell, 
  Activity,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react'
import { format } from 'date-fns'

function StatCard({ title, value, icon: Icon, description, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className="card p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {description && (
            <p className="text-sm text-gray-500">{description}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function PMSStatusBadge({ status }) {
  const statusConfig = {
    connected: {
      color: 'green',
      icon: CheckCircle,
      text: 'Connected'
    },
    disconnected: {
      color: 'red',
      icon: AlertCircle,
      text: 'Disconnected'
    },
    error: {
      color: 'red',
      icon: AlertCircle,
      text: 'Error'
    }
  }

  const config = statusConfig[status] || statusConfig.disconnected
  const Icon = config.icon

  return (
    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
      config.color === 'green' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.text}
    </div>
  )
}

function Dashboard() {
  const { data: response, isLoading, error } = useQuery(
    'dashboard-stats',
    dashboardAPI.getStats,
    {
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  )

  // Extract the actual data from axios response
  const stats = response?.data

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="flex items-center">
                <div className="bg-gray-200 rounded-lg p-3">
                  <div className="h-6 w-6 bg-gray-300 rounded"></div>
                </div>
                <div className="ml-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-6 bg-gray-200 rounded w-12"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="card p-6">
          <div className="flex items-center text-red-600">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>Failed to load dashboard data</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            PMS Status: <PMSStatusBadge status={stats?.pms?.status} />
          </div>
          <div className="text-sm text-gray-500">
            Last updated: {format(new Date(), 'HH:mm:ss')}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Devices"
          value={stats?.devices?.total || 0}
          icon={Monitor}
          description={`${stats?.devices?.active || 0} active`}
          color="blue"
        />
        <StatCard
          title="Online Devices"
          value={stats?.devices?.online || 0}
          icon={Activity}
          description={`${stats?.devices?.offline || 0} offline`}
          color="green"
        />
        <StatCard
          title="Media Bundles"
          value={stats?.content?.bundles || 0}
          icon={Image}
          description="Available content"
          color="yellow"
        />
        <StatCard
          title="Notifications"
          value={stats?.notifications?.pending || 0}
          icon={Bell}
          description={`${stats?.notifications?.total || 0} total`}
          color="red"
        />
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">System Overview</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Active Apps</span>
              <span className="font-medium">{stats?.content?.apps || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Guest Records</span>
              <span className="font-medium">{stats?.pms?.guests || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Bills Retrieved</span>
              <span className="font-medium">{stats?.pms?.bills_retrieved || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Notifications Sent</span>
              <span className="font-medium">{stats?.notifications?.sent || 0}</span>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {stats?.recent_activity?.length > 0 ? (
              stats.recent_activity.map((activity, index) => (
                <div key={index} className="flex items-center text-sm">
                  <Clock className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-gray-600">
                    Device {activity.device_id} {activity.status === 'active' ? 'activated' : 'updated'}
                    {activity.room_number && ` in room ${activity.room_number}`}
                  </span>
                  <span className="ml-auto text-gray-400">
                    {format(new Date(activity.updated_at), 'HH:mm')}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500 text-center py-4">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="btn btn-primary btn-md">
            <Users className="h-4 w-4 mr-2" />
            Manage Devices
          </button>
          <button className="btn btn-secondary btn-md">
            <Bell className="h-4 w-4 mr-2" />
            Send Notification
          </button>
          <button className="btn btn-secondary btn-md">
            <Image className="h-4 w-4 mr-2" />
            Upload Media
          </button>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
