import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../services/api';

const ClosestApproach = () => {
  const [satelliteId, setSatelliteId] = useState('');
  const [threshold, setThreshold] = useState(10);
  const [searchResult, setSearchResult] = useState(null);

  const { data: alerts, isLoading: alertsLoading, refetch } = useQuery({
    queryKey: ['closestApproachAlerts'],
    queryFn: () => api.get('/closest-approach/alerts').then(r => r.data.data || [])
  });

  const { data: config } = useQuery({
    queryKey: ['closestApproachConfig'],
    queryFn: () => api.get('/closest-approach/config').then(r => r.data.data)
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post('/closest-approach/scan', { threshold: 10 }),
    onSuccess: (data) => {
      console.log('Scan complete:', data);
      refetch();
    },
    onError: (err) => {
      console.error('Scan error:', err);
      alert('Scan failed: ' + (err.message || 'Unknown error'));
    }
  });

  const handleSearch = async () => {
    if (!satelliteId) return;
    try {
      const res = await api.get(`/closest-approach/${satelliteId}?threshold=${threshold}`);
      setSearchResult(res.data.data);
    } catch (err) {
      console.error(err);
      setSearchResult({ error: err.response?.data?.error || err.message });
    }
  };

  const handleScan = () => {
    scanMutation.mutate();
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'text-red-400 bg-red-400/10';
      case 'high': return 'text-orange-400 bg-orange-400/10';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10';
      default: return 'text-green-400 bg-green-400/10';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-orbitron font-bold text-white">Closest Approach</h1>
        <span className="text-neon-cyan text-sm">Real-time Proximity Alerts</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
          <h2 className="text-xl font-semibold text-white mb-4">Search Satellite</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">NORAD Cat ID</label>
              <input
                type="number"
                value={satelliteId}
                onChange={(e) => setSatelliteId(e.target.value)}
                placeholder="Enter NORAD ID"
                className="w-full bg-space-dark border border-glass-border rounded-lg px-4 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">Threshold (km)</label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full bg-space-dark border border-glass-border rounded-lg px-4 py-2 text-white"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!satelliteId}
              className="w-full bg-neon-cyan/20 hover:bg-neon-cyan/30 text-neon-cyan py-2 rounded-lg border border-neon-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Find Closest Approaches
            </button>
            <button
              onClick={handleScan}
              disabled={scanMutation.isPending}
              className="w-full bg-cosmic-blue/20 hover:bg-cosmic-blue/30 text-cosmic-blue py-2 rounded-lg border border-cosmic-blue/30 disabled:opacity-50"
            >
              {scanMutation.isPending ? 'Scanning...' : 'Scan All Satellites'}
            </button>
          </div>
          
          {searchResult && (
            <div className="mt-4 p-3 bg-space-dark rounded-lg">
              {searchResult.error ? (
                <div className="text-red-400 text-sm">{searchResult.error}</div>
              ) : (
                <div className="text-white text-sm">
                  <div className="font-medium">{searchResult.reference?.name}</div>
                  <div className="text-white/50">Found: {searchResult.totalFound || 0} approaches</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
          <h2 className="text-xl font-semibold text-white mb-4">Threshold Configuration</h2>
          <div className="space-y-3">
            {config?.thresholds && Object.entries(config.thresholds).map(([shell, value]) => (
              <div key={shell} className="flex items-center justify-between">
                <span className="text-white uppercase">{shell}</span>
                <span className="text-neon-cyan font-mono">{value} km</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-glass-border">
            <div className="text-white/50 text-sm">Alert Cooldown</div>
            <div className="text-white">{config?.config?.ALERT_COOLDOWN_MINUTES || 30} minutes</div>
          </div>
        </div>

        <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
          <h2 className="text-xl font-semibold text-white mb-4">Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-white/70">Critical</span>
              <span className="text-red-400 font-bold">
                {alerts?.filter(a => a.priority === 'critical').length || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70">High</span>
              <span className="text-orange-400 font-bold">
                {alerts?.filter(a => a.priority === 'high').length || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70">Medium</span>
              <span className="text-yellow-400 font-bold">
                {alerts?.filter(a => a.priority === 'medium').length || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70">Low</span>
              <span className="text-green-400 font-bold">
                {alerts?.filter(a => a.priority === 'low').length || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
        <h2 className="text-xl font-semibold text-white mb-4">Active Closest Approach Alerts</h2>
        {alertsLoading ? (
          <div className="text-white/50">Loading...</div>
        ) : alerts && alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.slice(0, 15).map((alert, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-space-dark rounded-lg border border-glass-border">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">
                      {alert.referenceSatellite?.name}
                    </span>
                    <span className="text-neon-cyan">↔</span>
                    <span className="text-white font-medium">
                      {alert.approachingObject?.name}
                    </span>
                  </div>
                  <div className="text-white/50 text-sm mt-1">
                    TCA: {alert.closestApproach?.time ? new Date(alert.closestApproach.time).toLocaleString() : 'N/A'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl text-neon-cyan font-bold">
                    {alert.closestApproach?.distanceKm?.toFixed(2)} km
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(alert.priority)}`}>
                    {alert.priority?.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-white/50">No active alerts - click "Scan All Satellites" to detect</div>
        )}
      </div>
    </div>
  );
};

export default ClosestApproach;