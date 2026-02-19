import { useState, useEffect } from 'react';
import api, { webhookApi } from '../services/api';

const Admin = () => {
  const [health, setHealth] = useState(null);
  const [circuitBreakers, setCircuitBreakers] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('health');
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    type: 'custom',
    url: '',
    enabled: true,
    config: {}
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all data in parallel
      const [healthRes, cbRes, metricsRes] = await Promise.allSettled([
        api.get('/health'),
        api.get('/health/circuit-breakers'),
        api.get('/metrics')
      ]);
      
      // Handle results
      if (healthRes.status === 'fulfilled') {
        setHealth(healthRes.value.data);
      }
      
      if (cbRes.status === 'fulfilled') {
        setCircuitBreakers(cbRes.value.data);
      }
      
      if (metricsRes.status === 'fulfilled') {
        setMetrics(metricsRes.value.data);
      }
      
      // Check if all failed
      if (healthRes.status === 'rejected' && cbRes.status === 'rejected' && metricsRes.status === 'rejected') {
        setError('Server unavailable. Make sure the backend is running on port 5000');
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch admin data');
    }
    setLoading(false);
  };

  const fetchWebhooks = async () => {
    try {
      const response = await webhookApi.getAll();
      setWebhooks(response.data.data || response.data);
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    }
  };

  const handleSaveWebhook = async (e) => {
    e.preventDefault();
    try {
      if (editingWebhook) {
        await webhookApi.update(editingWebhook._id, webhookForm);
      } else {
        await webhookApi.create(webhookForm);
      }
      setShowWebhookModal(false);
      setEditingWebhook(null);
      setWebhookForm({ name: '', type: 'custom', url: '', enabled: true, config: {} });
      fetchWebhooks();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    try {
      await webhookApi.delete(id);
      fetchWebhooks();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTestWebhook = async (id) => {
    try {
      await webhookApi.test(id);
      alert('Test notification sent!');
    } catch (err) {
      alert('Test failed: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#00d4ff' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">System Admin</h1>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg text-white transition-colors"
          style={{ backgroundColor: '#00d4ff' }}
        >
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg">
          <p className="text-red-400">{error}</p>
          <p className="text-red-300 text-sm mt-2">Make sure the server is running: cd server && npm run dev</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        {['health', 'circuit-breakers', 'metrics', 'webhooks'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === 'webhooks') fetchWebhooks();
            }}
            className="px-4 py-2 rounded-lg capitalize transition-colors"
            style={{
              backgroundColor: activeTab === tab ? '#00d4ff' : '#1a1a2e',
              color: activeTab === tab ? '#000' : '#fff'
            }}
          >
            {tab.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Health Tab */}
      {activeTab === 'health' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {health ? (
            <>
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 mb-2">Status</h3>
                <p className={`text-2xl font-bold ${health.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                  {health.status?.toUpperCase() || 'UNKNOWN'}
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 mb-2">Uptime</h3>
                <p className="text-2xl font-bold text-white">{Math.floor(health.uptime / 60)} min</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm text-gray-400 mb-2">Timestamp</h3>
                <p className="text-sm font-mono text-white">{new Date(health.timestamp).toLocaleString()}</p>
              </div>
            </>
          ) : (
            <div className="col-span-3 bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-gray-400">Health data unavailable</p>
            </div>
          )}
        </div>
      )}

      {/* Circuit Breakers Tab */}
      {activeTab === 'circuit-breakers' && (
        <div className="space-y-4">
          {circuitBreakers?.circuitBreakers ? (
            Object.entries(circuitBreakers.circuitBreakers).map(([name, cb]) => (
              <div key={name} className="bg-gray-800 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-semibold text-white">{name}</h3>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      cb.state === 'CLOSED' ? 'bg-green-900 text-green-400' :
                      cb.state === 'OPEN' ? 'bg-red-900 text-red-400' :
                      'bg-yellow-900 text-yellow-400'
                    }`}
                  >
                    {cb.state}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Total:</span>
                    <p className="font-mono text-white">{cb.stats?.totalRequests || 0}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Success:</span>
                    <p className="font-mono text-green-400">{cb.stats?.successfulRequests || 0}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Failed:</span>
                    <p className="font-mono text-red-400">{cb.stats?.failedRequests || 0}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Rejected:</span>
                    <p className="font-mono text-yellow-400">{cb.stats?.rejectedRequests || 0}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-gray-400">Circuit breaker data unavailable</p>
            </div>
          )}
        </div>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <div className="space-y-4">
          {metrics ? (
            <>
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-white">HTTP Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-gray-400 text-sm">Total Requests</span>
                    <p className="text-2xl font-mono text-white">{metrics.http?.summary?.totalRequests || 0}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Avg Response</span>
                    <p className="text-2xl font-mono text-white">{metrics.http?.summary?.avgResponseTime || 0}ms</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Error Rate</span>
                    <p className="text-2xl font-mono text-red-400">{metrics.http?.summary?.errorRate || 0}%</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Cache Hit Rate</span>
                    <p className="text-2xl font-mono text-green-400">{metrics.http?.summary?.cacheHitRate || 0}%</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-white">System Resources</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-gray-400 text-sm">Memory RSS</span>
                    <p className="text-xl font-mono text-white">{Math.round((metrics.system?.memory?.rss || 0) / 1024 / 1024)} MB</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Heap Used</span>
                    <p className="text-xl font-mono text-white">{Math.round((metrics.system?.memory?.heapUsed || 0) / 1024 / 1024)} MB</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">CPU Load (1m)</span>
                    <p className="text-xl font-mono text-white">{metrics.system?.cpu?.loadavg?.[0]?.toFixed(2) || 0}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Event Loop</span>
                    <p className="text-xl font-mono text-white">{metrics.system?.eventLoop?.lag?.toFixed(2) || 0}ms</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-gray-400">Metrics data unavailable</p>
            </div>
          )}
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Webhook Configurations</h2>
            <button
              onClick={() => {
                setEditingWebhook(null);
                setWebhookForm({ name: '', type: 'custom', url: '', enabled: true, config: {} });
                setShowWebhookModal(true);
              }}
              className="px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: '#00d4ff' }}
            >
              Add Webhook
            </button>
          </div>

          {webhooks.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-400">No webhooks configured</p>
              <p className="text-gray-500 text-sm mt-2">Add a webhook to receive external notifications</p>
            </div>
          ) : (
            <div className="space-y-4">
              {webhooks.map((webhook) => (
                <div key={webhook._id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">{webhook.name}</h3>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            webhook.enabled ? 'bg-green-900 text-green-400' : 'bg-gray-700 text-gray-400'
                          }`}
                        >
                          {webhook.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-900 text-blue-400">
                          {webhook.type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 font-mono">{webhook.url}</p>
                      {webhook.stats && (
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span>Sent: {webhook.stats.totalSent}</span>
                          <span>Success: {webhook.stats.totalSuccessful}</span>
                          <span>Failed: {webhook.stats.totalFailed}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTestWebhook(webhook._id)}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white"
                      >
                        Test
                      </button>
                      <button
                        onClick={() => {
                          setEditingWebhook(webhook);
                          setWebhookForm({
                            name: webhook.name,
                            type: webhook.type,
                            url: webhook.url,
                            enabled: webhook.enabled,
                            config: webhook.config || {}
                          });
                          setShowWebhookModal(true);
                        }}
                        className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-sm text-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(webhook._id)}
                        className="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm text-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Webhook Modal */}
      {showWebhookModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowWebhookModal(false)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">
              {editingWebhook ? 'Edit Webhook' : 'Add Webhook'}
            </h2>
            <form onSubmit={handleSaveWebhook} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={webhookForm.name}
                  onChange={(e) => setWebhookForm({ ...webhookForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Type</label>
                <select
                  value={webhookForm.type}
                  onChange={(e) => setWebhookForm({ ...webhookForm, type: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                >
                  <option value="slack">Slack</option>
                  <option value="pagerduty">PagerDuty</option>
                  <option value="email">Email</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">URL</label>
                <input
                  type="url"
                  value={webhookForm.url}
                  onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={webhookForm.enabled}
                  onChange={(e) => setWebhookForm({ ...webhookForm, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="enabled" className="text-sm text-gray-400">Enabled</label>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded text-white"
                  style={{ backgroundColor: '#00d4ff' }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(false)}
                  className="px-4 py-2 bg-gray-700 rounded text-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
