import React, { useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, Newspaper } from 'lucide-react'
import toast from 'react-hot-toast'

const sampleFtaChannels = [
  {
    id: 'fta-1',
    name: 'MBC 1',
    provider: 'MBC Group',
    frequency: '11747 H',
    symbolRate: '27500',
    category: 'Entertainment',
    quality: 86,
    enabled: true
  },
  {
    id: 'fta-2',
    name: 'Al Jazeera',
    provider: 'Al Jazeera Media',
    frequency: '11045 V',
    symbolRate: '27500',
    category: 'News',
    quality: 92,
    enabled: true
  },
  {
    id: 'fta-3',
    name: 'National Geographic',
    provider: 'NGC',
    frequency: '11823 H',
    symbolRate: '27500',
    category: 'Documentary',
    quality: 74,
    enabled: true
  },
  {
    id: 'fta-4',
    name: 'BBC World',
    provider: 'BBC',
    frequency: '11900 V',
    symbolRate: '27500',
    category: 'News',
    quality: 68,
    enabled: false
  }
]

const sampleLocalChannels = [
  {
    id: 'local-1',
    name: 'Marmarica News',
    region: 'Matrouh',
    frequency: 'UHF 28',
    category: 'News',
    quality: 88,
    enabled: true
  },
  {
    id: 'local-2',
    name: 'Alexandria TV',
    region: 'Alexandria',
    frequency: 'UHF 32',
    category: 'Local',
    quality: 77,
    enabled: true
  },
  {
    id: 'local-3',
    name: 'Cairo One',
    region: 'Cairo',
    frequency: 'UHF 24',
    category: 'Entertainment',
    quality: 70,
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

function ChannelManagement() {
  const [activeTab, setActiveTab] = useState('fta')
  const [ftaChannels, setFtaChannels] = useState(() => sampleFtaChannels)
  const [localChannels, setLocalChannels] = useState(() => sampleLocalChannels)
  const [newsItems, setNewsItems] = useState(() => sampleNews)
  const [ftaScanAt, setFtaScanAt] = useState(() => new Date())
  const [localScanAt, setLocalScanAt] = useState(() => new Date())
  const [ftaSearch, setFtaSearch] = useState('')
  const [localSearch, setLocalSearch] = useState('')
  const [ftaForm, setFtaForm] = useState({
    name: '',
    provider: '',
    frequency: '',
    symbolRate: '',
    category: 'Entertainment'
  })
  const [localForm, setLocalForm] = useState({
    name: '',
    region: '',
    frequency: '',
    category: 'Local'
  })
  const [newsForm, setNewsForm] = useState({
    title: '',
    body: ''
  })
  const [ftaScanning, setFtaScanning] = useState(false)
  const [localScanning, setLocalScanning] = useState(false)

  const filteredFtaChannels = useMemo(() => {
    const query = ftaSearch.trim().toLowerCase()
    if (!query) return ftaChannels
    return ftaChannels.filter((channel) =>
      [channel.name, channel.provider, channel.category, channel.frequency]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    )
  }, [ftaChannels, ftaSearch])

  const filteredLocalChannels = useMemo(() => {
    const query = localSearch.trim().toLowerCase()
    if (!query) return localChannels
    return localChannels.filter((channel) =>
      [channel.name, channel.region, channel.category, channel.frequency]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query))
    )
  }, [localChannels, localSearch])

  const simulateScan = (type) => {
    if (type === 'fta') {
      if (ftaScanning) return
      setFtaScanning(true)
      setTimeout(() => {
        setFtaChannels((prev) =>
          prev.map((channel) => ({
            ...channel,
            quality: Math.max(45, Math.min(100, channel.quality + (Math.random() * 20 - 10)))
          }))
        )
        setFtaScanAt(new Date())
        setFtaScanning(false)
        toast.success('FTA scan completed')
      }, 900)
    }

    if (type === 'local') {
      if (localScanning) return
      setLocalScanning(true)
      setTimeout(() => {
        setLocalChannels((prev) =>
          prev.map((channel) => ({
            ...channel,
            quality: Math.max(40, Math.min(100, channel.quality + (Math.random() * 25 - 12)))
          }))
        )
        setLocalScanAt(new Date())
        setLocalScanning(false)
        toast.success('Local scan completed')
      }, 900)
    }
  }

  const toggleChannel = (type, id) => {
    if (type === 'fta') {
      setFtaChannels((prev) =>
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

  const handleAddFtaChannel = (e) => {
    e.preventDefault()
    if (!ftaForm.name.trim() || !ftaForm.frequency.trim()) {
      toast.error('Channel name and frequency are required')
      return
    }

    const newChannel = {
      id: `fta-${Date.now()}`,
      name: ftaForm.name.trim(),
      provider: ftaForm.provider.trim() || 'Custom Provider',
      frequency: ftaForm.frequency.trim(),
      symbolRate: ftaForm.symbolRate.trim() || '27500',
      category: ftaForm.category,
      quality: 70 + Math.floor(Math.random() * 25),
      enabled: true
    }

    setFtaChannels((prev) => [newChannel, ...prev])
    setFtaForm({
      name: '',
      provider: '',
      frequency: '',
      symbolRate: '',
      category: 'Entertainment'
    })
    toast.success('FTA channel added (simulation)')
  }

  const handleAddLocalChannel = (e) => {
    e.preventDefault()
    if (!localForm.name.trim() || !localForm.frequency.trim()) {
      toast.error('Channel name and frequency are required')
      return
    }

    const newChannel = {
      id: `local-${Date.now()}`,
      name: localForm.name.trim(),
      region: localForm.region.trim() || 'Local Area',
      frequency: localForm.frequency.trim(),
      category: localForm.category,
      quality: 65 + Math.floor(Math.random() * 25),
      enabled: true
    }

    setLocalChannels((prev) => [newChannel, ...prev])
    setLocalForm({
      name: '',
      region: '',
      frequency: '',
      category: 'Local'
    })
    toast.success('Local channel added (simulation)')
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

  const tabs = [
    { id: 'fta', name: 'FTA Channels' },
    { id: 'local', name: 'Local Channels' },
    { id: 'news', name: 'News Ticker' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Channel Management</h1>
        <p className="text-sm text-gray-500">
          Simulation workspace for managing channel lineups, scans, and the news ticker. Changes are for display only and are not stored in the database.
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

      {activeTab === 'fta' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-sm text-gray-500">Total Channels</p>
              <p className="text-2xl font-semibold text-gray-900">{ftaChannels.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-500">Active Channels</p>
              <p className="text-2xl font-semibold text-gray-900">
                {ftaChannels.filter((channel) => channel.enabled).length}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-500">Last Scan</p>
              <p className="text-sm font-semibold text-gray-900">
                {ftaScanAt.toLocaleString()}
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
                    value={ftaSearch}
                    onChange={(e) => setFtaSearch(e.target.value)}
                    className="input pl-9"
                    placeholder="Search FTA channels by name, provider, or frequency"
                  />
                </div>
              </div>
              <button
                onClick={() => simulateScan('fta')}
                className="btn btn-secondary btn-md"
                disabled={ftaScanning}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${ftaScanning ? 'animate-spin' : ''}`} />
                {ftaScanning ? 'Scanning...' : 'Simulate Scan'}
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Add FTA Channel</h3>
            <form onSubmit={handleAddFtaChannel} className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                type="text"
                className="input"
                placeholder="Channel name"
                value={ftaForm.name}
                onChange={(e) => setFtaForm({ ...ftaForm, name: e.target.value })}
              />
              <input
                type="text"
                className="input"
                placeholder="Provider"
                value={ftaForm.provider}
                onChange={(e) => setFtaForm({ ...ftaForm, provider: e.target.value })}
              />
              <input
                type="text"
                className="input"
                placeholder="Frequency (e.g. 11747 H)"
                value={ftaForm.frequency}
                onChange={(e) => setFtaForm({ ...ftaForm, frequency: e.target.value })}
              />
              <input
                type="text"
                className="input"
                placeholder="Symbol rate"
                value={ftaForm.symbolRate}
                onChange={(e) => setFtaForm({ ...ftaForm, symbolRate: e.target.value })}
              />
              <div className="flex gap-2">
                <select
                  className="input"
                  value={ftaForm.category}
                  onChange={(e) => setFtaForm({ ...ftaForm, category: e.target.value })}
                >
                  <option>Entertainment</option>
                  <option>News</option>
                  <option>Sports</option>
                  <option>Kids</option>
                  <option>Documentary</option>
                </select>
                <button type="submit" className="btn btn-primary btn-md whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </button>
              </div>
            </form>
          </div>

          <div className="card p-4">
            <table className="table">
              <thead className="table-header">
                <tr className="table-row">
                  <th className="table-head">Channel</th>
                  <th className="table-head">Frequency</th>
                  <th className="table-head">Category</th>
                  <th className="table-head">Signal</th>
                  <th className="table-head">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredFtaChannels.map((channel) => (
                  <tr key={channel.id} className="table-row">
                    <td className="table-cell">
                      <div>
                        <p className="font-medium text-gray-900">{channel.name}</p>
                        <p className="text-xs text-gray-500">{channel.provider}</p>
                      </div>
                    </td>
                    <td className="table-cell text-sm text-gray-600">
                      <div>{channel.frequency}</div>
                      <div className="text-xs text-gray-400">SR {channel.symbolRate}</div>
                    </td>
                    <td className="table-cell text-sm text-gray-600">{channel.category}</td>
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
                        onClick={() => toggleChannel('fta', channel.id)}
                        className={`badge ${channel.enabled ? 'badge-default' : 'badge-secondary'}`}
                      >
                        {channel.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredFtaChannels.length === 0 && (
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
              <p className="text-sm text-gray-500">Total Channels</p>
              <p className="text-2xl font-semibold text-gray-900">{localChannels.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-500">Active Channels</p>
              <p className="text-2xl font-semibold text-gray-900">
                {localChannels.filter((channel) => channel.enabled).length}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-gray-500">Last Scan</p>
              <p className="text-sm font-semibold text-gray-900">
                {localScanAt.toLocaleString()}
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
                    placeholder="Search local channels by name, region, or frequency"
                  />
                </div>
              </div>
              <button
                onClick={() => simulateScan('local')}
                className="btn btn-secondary btn-md"
                disabled={localScanning}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${localScanning ? 'animate-spin' : ''}`} />
                {localScanning ? 'Scanning...' : 'Simulate Scan'}
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
                placeholder="Region"
                value={localForm.region}
                onChange={(e) => setLocalForm({ ...localForm, region: e.target.value })}
              />
              <input
                type="text"
                className="input"
                placeholder="Frequency (e.g. UHF 28)"
                value={localForm.frequency}
                onChange={(e) => setLocalForm({ ...localForm, frequency: e.target.value })}
              />
              <div className="flex gap-2">
                <select
                  className="input"
                  value={localForm.category}
                  onChange={(e) => setLocalForm({ ...localForm, category: e.target.value })}
                >
                  <option>Local</option>
                  <option>News</option>
                  <option>Sports</option>
                  <option>Community</option>
                </select>
                <button type="submit" className="btn btn-primary btn-md whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </button>
              </div>
            </form>
          </div>

          <div className="card p-4">
            <table className="table">
              <thead className="table-header">
                <tr className="table-row">
                  <th className="table-head">Channel</th>
                  <th className="table-head">Region</th>
                  <th className="table-head">Frequency</th>
                  <th className="table-head">Signal</th>
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
                    <td className="table-cell text-sm text-gray-600">{channel.region}</td>
                    <td className="table-cell text-sm text-gray-600">{channel.frequency}</td>
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
