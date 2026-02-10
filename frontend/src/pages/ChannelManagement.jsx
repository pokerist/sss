import React, { useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, Newspaper, UploadCloud, Video } from 'lucide-react'
import toast from 'react-hot-toast'

const sampleIptvChannels = [
  {
    id: 'iptv-1',
    name: 'Marmarica Live',
    group: 'Hotel Live',
    streamUrl: 'rtsp://10.10.0.25:554/live/marmarica',
    protocol: 'RTSP',
    codec: 'H.264',
    quality: 92,
    enabled: true
  },
  {
    id: 'iptv-2',
    name: 'Sports Hub',
    group: 'Premium Sports',
    streamUrl: 'http://iptv.marmarica.local/hls/sports.m3u8',
    protocol: 'HLS',
    codec: 'H.265',
    quality: 80,
    enabled: true
  },
  {
    id: 'iptv-3',
    name: 'News Arabic',
    group: 'News',
    streamUrl: 'udp://239.10.10.20:5000',
    protocol: 'UDP',
    codec: 'MPEG-TS',
    quality: 84,
    enabled: true
  },
  {
    id: 'iptv-4',
    name: 'Kids Zone',
    group: 'Family',
    streamUrl: 'http://iptv.marmarica.local/hls/kids.m3u8',
    protocol: 'HLS',
    codec: 'H.264',
    quality: 66,
    enabled: false
  }
]

const sampleLocalChannels = [
  {
    id: 'local-1',
    name: 'Marmarica TV',
    zone: 'Main Lobby',
    category: 'Hotel Info',
    loopItems: [
      { id: 'loop-1', name: 'welcome-loop.mp4', sizeMb: 24.3, addedAt: new Date().toISOString() },
      { id: 'loop-2', name: 'spa-offers.mp4', sizeMb: 18.9, addedAt: new Date().toISOString() }
    ],
    updatedAt: new Date().toISOString(),
    enabled: true
  },
  {
    id: 'local-2',
    name: 'Beach Cam',
    zone: 'Pool Deck',
    category: 'Live Loop',
    loopItems: [
      { id: 'loop-3', name: 'sunset-loop.mp4', sizeMb: 52.1, addedAt: new Date().toISOString() }
    ],
    updatedAt: new Date().toISOString(),
    enabled: true
  },
  {
    id: 'local-3',
    name: 'Marmarica Events',
    zone: 'Conference Hall',
    category: 'Events',
    loopItems: [],
    updatedAt: new Date().toISOString(),
    enabled: false
  }
]

const sampleNews = [
  {
    id: 'news-1',
    title: 'Welcome to Marmarica',
    body: 'Enjoy premium hospitality and curated entertainment throughout your stay.',
    createdAt: new Date().toISOString()
  },
  {
    id: 'news-2',
    title: 'Dining Update',
    body: 'The main restaurant is open from 7:00 AM to 11:00 PM.',
    createdAt: new Date().toISOString()
  }
]

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function ChannelManagement() {
  const [activeTab, setActiveTab] = useState('iptv')
  const [iptvChannels, setIptvChannels] = useState(() => sampleIptvChannels)
  const [localChannels, setLocalChannels] = useState(() => sampleLocalChannels)
  const [newsItems, setNewsItems] = useState(() => sampleNews)
  const [iptvScanAt, setIptvScanAt] = useState(() => new Date())
  const [localSyncAt, setLocalSyncAt] = useState(() => new Date())
  const [iptvSearch, setIptvSearch] = useState('')
  const [localSearch, setLocalSearch] = useState('')
  const [iptvForm, setIptvForm] = useState({
    name: '',
    group: '',
    streamUrl: '',
    protocol: 'HLS',
    codec: 'H.264'
  })
  const [localForm, setLocalForm] = useState({
    name: '',
    zone: '',
    category: 'Hotel Info'
  })
  const [newsForm, setNewsForm] = useState({
    title: '',
    body: ''
  })
  const [iptvScanning, setIptvScanning] = useState(false)
  const [localSyncing, setLocalSyncing] = useState(false)
  const [localUploadTargetId, setLocalUploadTargetId] = useState(() => sampleLocalChannels[0]?.id || '')
  const [localUploadFiles, setLocalUploadFiles] = useState([])
  const [localLoopViewId, setLocalLoopViewId] = useState(() => sampleLocalChannels[0]?.id || '')

  const filteredIptvChannels = useMemo(() => {
    const query = iptvSearch.trim().toLowerCase()
    if (!query) return iptvChannels
    return iptvChannels.filter((channel) =>
      [channel.name, channel.group, channel.streamUrl, channel.protocol]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    )
  }, [iptvChannels, iptvSearch])

  const filteredLocalChannels = useMemo(() => {
    const query = localSearch.trim().toLowerCase()
    if (!query) return localChannels
    return localChannels.filter((channel) =>
      [channel.name, channel.zone, channel.category]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    )
  }, [localChannels, localSearch])

  const simulateScan = (type) => {
    if (type === 'iptv') {
      if (iptvScanning) return
      setIptvScanning(true)
      setTimeout(() => {
        setIptvChannels((prev) =>
          prev.map((channel) => ({
            ...channel,
            quality: Math.max(45, Math.min(100, channel.quality + (Math.random() * 18 - 8)))
          }))
        )
        setIptvScanAt(new Date())
        setIptvScanning(false)
        toast.success('IPTV health check completed')
      }, 900)
    }

    if (type === 'local') {
      if (localSyncing) return
      setLocalSyncing(true)
      setTimeout(() => {
        setLocalChannels((prev) =>
          prev.map((channel) => ({
            ...channel,
            updatedAt: new Date().toISOString()
          }))
        )
        setLocalSyncAt(new Date())
        setLocalSyncing(false)
        toast.success('Local loop sync completed')
      }, 900)
    }
  }

  const toggleChannel = (type, id) => {
    if (type === 'iptv') {
      setIptvChannels((prev) =>
        prev.map((channel) =>
          channel.id === id ? { ...channel, enabled: !channel.enabled } : channel
        )
      )
      return
    }

    setLocalChannels((prev) =>
      prev.map((channel) =>
        channel.id === id ? { ...channel, enabled: !channel.enabled } : channel
      )
    )
  }

  const handleAddIptvChannel = (e) => {
    e.preventDefault()
    if (!iptvForm.name.trim() || !iptvForm.streamUrl.trim()) {
      toast.error('Channel name and stream URL are required')
      return
    }

    const newChannel = {
      id: `iptv-${Date.now()}`,
      name: iptvForm.name.trim(),
      group: iptvForm.group.trim() || 'Custom Group',
      streamUrl: iptvForm.streamUrl.trim(),
      protocol: iptvForm.protocol,
      codec: iptvForm.codec,
      quality: 70 + Math.floor(Math.random() * 25),
      enabled: true
    }

    setIptvChannels((prev) => [newChannel, ...prev])
    setIptvForm({
      name: '',
      group: '',
      streamUrl: '',
      protocol: 'HLS',
      codec: 'H.264'
    })
    toast.success('IPTV channel added (simulation)')
  }

  const handleAddLocalChannel = (e) => {
    e.preventDefault()
    if (!localForm.name.trim()) {
      toast.error('Channel name is required')
      return
    }

    const newChannel = {
      id: `local-${Date.now()}`,
      name: localForm.name.trim(),
      zone: localForm.zone.trim() || 'Local Area',
      category: localForm.category,
      loopItems: [],
      updatedAt: new Date().toISOString(),
      enabled: true
    }

    setLocalChannels((prev) => [newChannel, ...prev])
    if (!localUploadTargetId) {
      setLocalUploadTargetId(newChannel.id)
      setLocalLoopViewId(newChannel.id)
    }
    setLocalForm({
      name: '',
      zone: '',
      category: 'Hotel Info'
    })
    toast.success('Local channel added (simulation)')
  }

  const handleLocalFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    setLocalUploadFiles(files)
  }

  const handleAddLoopContent = (e) => {
    e.preventDefault()
    if (!localUploadTargetId) {
      toast.error('Select a local channel first')
      return
    }
    if (localUploadFiles.length === 0) {
      toast.error('Select at least one video file')
      return
    }

    const newItems = localUploadFiles.map((file) => ({
      id: `loop-${Date.now()}-${file.name}`,
      name: file.name,
      sizeMb: Number((file.size / 1024 / 1024).toFixed(1)),
      addedAt: new Date().toISOString()
    }))

    setLocalChannels((prev) =>
      prev.map((channel) =>
        channel.id === localUploadTargetId
          ? {
              ...channel,
              loopItems: [...channel.loopItems, ...newItems],
              updatedAt: new Date().toISOString()
            }
          : channel
      )
    )

    setLocalUploadFiles([])
    toast.success('Videos added to local loop (simulation)')
  }

  const handleRemoveLoopItem = (channelId, itemId) => {
    setLocalChannels((prev) =>
      prev.map((channel) =>
        channel.id === channelId
          ? {
              ...channel,
              loopItems: channel.loopItems.filter((item) => item.id !== itemId),
              updatedAt: new Date().toISOString()
            }
          : channel
      )
    )
  }

  const handleAddNews = (e) => {
    e.preventDefault()
    if (!newsForm.title.trim() || !newsForm.body.trim()) {
      toast.error('News title and body are required')
      return
    }

    const newItem = {
      id: `news-${Date.now()}`,
      title: newsForm.title.trim(),
      body: newsForm.body.trim(),
      createdAt: new Date().toISOString()
    }

    setNewsItems((prev) => [newItem, ...prev])
    setNewsForm({ title: '', body: '' })
    toast.success('News item added to preview')
  }

  const handleDeleteNews = (id) => {
    setNewsItems((prev) => prev.filter((item) => item.id !== id))
  }

  const tickerItems = newsItems.length > 0 ? newsItems : sampleNews
  const selectedLoopChannel = localChannels.find((channel) => channel.id === localLoopViewId)

  const tabs = [
    { id: 'iptv', name: 'IPTV Channels' },
    { id: 'local', name: 'Local Loop Channels' },
    { id: 'news', name: 'News Ticker' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Channel Management</h1>
        <p className="text-sm text-gray-500">
          Simulation workspace for live IPTV streams, local loop channels, and the news ticker. Changes are for display only and are not stored in the database.
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex flex-wrap gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'iptv' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-sm text-gray-500">Total Streams</p>
              <p className="text-2xl font-semibold text-gray-900">{iptvChannels.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-500">Active Streams</p>
              <p className="text-2xl font-semibold text-gray-900">
                {iptvChannels.filter((channel) => channel.enabled).length}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-500">Last Health Check</p>
              <p className="text-sm font-semibold text-gray-900">
                {iptvScanAt.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={iptvSearch}
                    onChange={(e) => setIptvSearch(e.target.value)}
                    className="input pl-9"
                    placeholder="Search IPTV channels by name, group, or URL"
                  />
                </div>
              </div>
              <button
                onClick={() => simulateScan('iptv')}
                className="btn btn-secondary btn-md"
                disabled={iptvScanning}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${iptvScanning ? 'animate-spin' : ''}`} />
                {iptvScanning ? 'Checking...' : 'Health Check'}
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Add IPTV Channel</h3>
            <form onSubmit={handleAddIptvChannel} className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input
                type="text"
                className="input"
                placeholder="Channel name"
                value={iptvForm.name}
                onChange={(e) => setIptvForm({ ...iptvForm, name: e.target.value })}
              />
              <input
                type="text"
                className="input"
                placeholder="Group"
                value={iptvForm.group}
                onChange={(e) => setIptvForm({ ...iptvForm, group: e.target.value })}
              />
              <input
                type="text"
                className="input"
                placeholder="Stream URL (rtsp/hls/udp)"
                value={iptvForm.streamUrl}
                onChange={(e) => setIptvForm({ ...iptvForm, streamUrl: e.target.value })}
              />
              <select
                className="input"
                value={iptvForm.protocol}
                onChange={(e) => setIptvForm({ ...iptvForm, protocol: e.target.value })}
              >
                <option>HLS</option>
                <option>RTSP</option>
                <option>UDP</option>
              </select>
              <select
                className="input"
                value={iptvForm.codec}
                onChange={(e) => setIptvForm({ ...iptvForm, codec: e.target.value })}
              >
                <option>H.264</option>
                <option>H.265</option>
                <option>MPEG-TS</option>
              </select>
              <button type="submit" className="btn btn-primary btn-md whitespace-nowrap">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </button>
            </form>
          </div>

          <div className="card p-4">
            <table className="table">
              <thead className="table-header">
                <tr className="table-row">
                  <th className="table-head">Channel</th>
                  <th className="table-head">Stream URL</th>
                  <th className="table-head">Protocol</th>
                  <th className="table-head">Health</th>
                  <th className="table-head">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredIptvChannels.map((channel) => (
                  <tr key={channel.id} className="table-row">
                    <td className="table-cell">
                      <div>
                        <p className="font-medium text-gray-900">{channel.name}</p>
                        <p className="text-xs text-gray-500">{channel.group}</p>
                      </div>
                    </td>
                    <td className="table-cell text-sm text-gray-600">
                      <div className="max-w-[260px] truncate" title={channel.streamUrl}>
                        {channel.streamUrl}
                      </div>
                    </td>
                    <td className="table-cell text-sm text-gray-600">
                      <div>{channel.protocol}</div>
                      <div className="text-xs text-gray-400">{channel.codec}</div>
                    </td>
                    <td className="table-cell">
                      <div className="space-y-1">
                        <div className="progress">
                          <div
                            className="progress-indicator"
                            style={{ width: `${channel.quality}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500">{Math.round(channel.quality)}%</p>
                      </div>
                    </td>
                    <td className="table-cell">
                      <button
                        onClick={() => toggleChannel('iptv', channel.id)}
                        className={`badge ${channel.enabled ? 'badge-default' : 'badge-secondary'}`}
                      >
                        {channel.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredIptvChannels.length === 0 && (
                  <tr className="table-row">
                    <td className="table-cell text-center text-gray-500" colSpan={5}>
                      No channels match this search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'local' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-sm text-gray-500">Total Local Channels</p>
              <p className="text-2xl font-semibold text-gray-900">{localChannels.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-500">Active Loops</p>
              <p className="text-2xl font-semibold text-gray-900">
                {localChannels.filter((channel) => channel.enabled).length}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-500">Last Sync</p>
              <p className="text-sm font-semibold text-gray-900">
                {localSyncAt.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className="input pl-9"
                    placeholder="Search local channels by name, zone, or category"
                  />
                </div>
              </div>
              <button
                onClick={() => simulateScan('local')}
                className="btn btn-secondary btn-md"
                disabled={localSyncing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${localSyncing ? 'animate-spin' : ''}`} />
                {localSyncing ? 'Syncing...' : 'Sync Loops'}
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Add Local Channel</h3>
            <form onSubmit={handleAddLocalChannel} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                className="input"
                placeholder="Channel name"
                value={localForm.name}
                onChange={(e) => setLocalForm({ ...localForm, name: e.target.value })}
              />
              <input
                type="text"
                className="input"
                placeholder="Zone or area"
                value={localForm.zone}
                onChange={(e) => setLocalForm({ ...localForm, zone: e.target.value })}
              />
              <select
                className="input"
                value={localForm.category}
                onChange={(e) => setLocalForm({ ...localForm, category: e.target.value })}
              >
                <option>Hotel Info</option>
                <option>Promotions</option>
                <option>Events</option>
                <option>Wayfinding</option>
              </select>
              <button type="submit" className="btn btn-primary btn-md whitespace-nowrap">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </button>
            </form>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <UploadCloud className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">Upload Loop Videos</h3>
            </div>
            <form onSubmit={handleAddLoopContent} className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <select
                className="input"
                value={localUploadTargetId}
                onChange={(e) => setLocalUploadTargetId(e.target.value)}
              >
                <option value="">Select channel</option>
                {localChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept="video/*"
                multiple
                onChange={handleLocalFileSelect}
                className="input"
              />
              <div className="text-xs text-gray-500 flex items-center">
                {localUploadFiles.length > 0
                  ? `${localUploadFiles.length} file(s) ready to add`
                  : 'Choose loop videos to repeat continuously'}
              </div>
              <button type="submit" className="btn btn-primary btn-md">
                <Video className="h-4 w-4 mr-2" />
                Add to Loop
              </button>
            </form>
          </div>

          <div className="card p-4">
            <table className="table">
              <thead className="table-header">
                <tr className="table-row">
                  <th className="table-head">Channel</th>
                  <th className="table-head">Zone</th>
                  <th className="table-head">Loop Items</th>
                  <th className="table-head">Last Updated</th>
                  <th className="table-head">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocalChannels.map((channel) => (
                  <tr key={channel.id} className="table-row">
                    <td className="table-cell">
                      <div>
                        <p className="font-medium text-gray-900">{channel.name}</p>
                        <p className="text-xs text-gray-500">{channel.category}</p>
                      </div>
                    </td>
                    <td className="table-cell text-sm text-gray-600">{channel.zone}</td>
                    <td className="table-cell text-sm text-gray-600">
                      {channel.loopItems.length} item(s)
                    </td>
                    <td className="table-cell text-sm text-gray-600">
                      {formatDateTime(channel.updatedAt)}
                    </td>
                    <td className="table-cell">
                      <button
                        onClick={() => toggleChannel('local', channel.id)}
                        className={`badge ${channel.enabled ? 'badge-default' : 'badge-secondary'}`}
                      >
                        {channel.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredLocalChannels.length === 0 && (
                  <tr className="table-row">
                    <td className="table-cell text-center text-gray-500" colSpan={5}>
                      No channels match this search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Loop Preview</h3>
                <p className="text-xs text-gray-500">Manage the repeating videos for each local channel.</p>
              </div>
              <select
                className="input max-w-xs"
                value={localLoopViewId}
                onChange={(e) => setLocalLoopViewId(e.target.value)}
              >
                <option value="">Select channel</option>
                {localChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </div>

            {!selectedLoopChannel ? (
              <p className="text-sm text-gray-500">Select a channel to preview its loop playlist.</p>
            ) : selectedLoopChannel.loopItems.length === 0 ? (
              <p className="text-sm text-gray-500">No loop videos added yet.</p>
            ) : (
              <div className="space-y-3">
                {selectedLoopChannel.loopItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {item.sizeMb} MB · added {formatDateTime(item.addedAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveLoopItem(selectedLoopChannel.id, item.id)}
                      className="btn btn-ghost btn-sm text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'news' && (
        <div className="space-y-6">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Newspaper className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">Bottom News Carousel</h3>
            </div>
            <p className="text-sm text-gray-500">
              Add news items to simulate what appears on the TV launcher ticker. This is a preview-only workspace.
            </p>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Create News Item</h3>
            <form onSubmit={handleAddNews} className="space-y-3">
              <input
                type="text"
                className="input"
                placeholder="News title"
                value={newsForm.title}
                onChange={(e) => setNewsForm({ ...newsForm, title: e.target.value })}
              />
              <textarea
                className="input h-28"
                placeholder="News body (what guests will read on the bottom ticker)"
                value={newsForm.body}
                onChange={(e) => setNewsForm({ ...newsForm, body: e.target.value })}
              />
              <div className="flex justify-end">
                <button type="submit" className="btn btn-primary btn-md">
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Carousel
                </button>
              </div>
            </form>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Preview Queue</h3>
            <div className="space-y-3">
              {newsItems.map((item) => (
                <div key={item.id} className="border rounded-md p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="text-sm text-gray-500">{item.body}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteNews(item.id)}
                      className="btn btn-ghost btn-sm text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {newsItems.length === 0 && (
                <p className="text-sm text-gray-500">No news items added yet.</p>
              )}
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-2 text-xs uppercase tracking-widest">
              Live News Ticker Preview
            </div>
            <div className="news-ticker">
              <div className="news-ticker-track">
                {[0, 1].map((iteration) => (
                  <div key={iteration} className="flex items-center gap-6">
                    {tickerItems.map((item) => (
                      <div key={`${iteration}-${item.id}`} className="flex items-center gap-3">
                        <span className="inline-flex h-2 w-2 rounded-full bg-blue-400"></span>
                        <span className="font-semibold">{item.title}</span>
                        <span className="text-gray-300">{item.body}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChannelManagement
