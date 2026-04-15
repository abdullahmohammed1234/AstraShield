import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

const Lifetime = () => {
  const [selectedId, setSelectedId] = useState(null);

  const { data: predictions, isLoading } = useQuery({
    queryKey: ['lifetimePredictions'],
    queryFn: () => api.get('/lifetime?limit=50').then(r => r.data.data.predictions || [])
  });

  const { data: stats } = useQuery({
    queryKey: ['lifetimeStats'],
    queryFn: () => api.get('/lifetime/statistics').then(r => r.data.data)
  });

  const { data: alerts } = useQuery({
    queryKey: ['lifetimeAlerts'],
    queryFn: () => api.get('/lifetime/alerts').then(r => r.data.data.alerts || [])
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'critical': return 'text-red-400 bg-red-400/10';
      case 'warning': return 'text-orange-400 bg-orange-400/10';
      case 'elevated': return 'text-yellow-400 bg-yellow-400/10';
      case 'stable': return 'text-green-400 bg-green-400/10';
      default: return 'text-blue-400 bg-blue-400/10';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-orbitron font-bold text-white">Satellite Lifetime</h1>
        <span className="text-neon-cyan text-sm">Orbital Decay Predictions</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-deep-space/50 rounded-xl p-4 border border-glass-border">
          <div className="text-white/50 text-sm">Total Analyzed</div>
          <div className="text-2xl text-neon-cyan">{stats?.totalAnalyzed || 0}</div>
        </div>
        <div className="bg-deep-space/50 rounded-xl p-4 border border-glass-border">
          <div className="text-white/50 text-sm">Critical</div>
          <div className="text-2xl text-red-400">{stats?.byStatus?.critical || 0}</div>
        </div>
        <div className="bg-deep-space/50 rounded-xl p-4 border border-glass-border">
          <div className="text-white/50 text-sm">Warning</div>
          <div className="text-2xl text-orange-400">{stats?.byStatus?.warning || 0}</div>
        </div>
        <div className="bg-deep-space/50 rounded-xl p-4 border border-glass-border">
          <div className="text-white/50 text-sm">Avg Altitude</div>
          <div className="text-2xl text-cosmic-blue">{stats?.averageAltitude || 0} km</div>
        </div>
      </div>

      {alerts && alerts.length > 0 && (
        <div className="bg-red-900/20 rounded-xl p-6 border border-red-500/30">
          <h2 className="text-xl font-semibold text-red-400 mb-4">⚠️ Critical Lifetime Alerts</h2>
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-space-dark rounded-lg">
                <div>
                  <span className="text-white font-medium">{alert.name}</span>
                  <span className="text-white/50 text-sm ml-2">#{alert.noradCatId}</span>
                </div>
                <div className="text-right">
                  <span className="text-red-400 font-bold">{alert.daysRemaining} days</span>
                  <span className="text-white/50 text-sm ml-2">@ {alert.currentAltitude} km</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
        <h2 className="text-xl font-semibold text-white mb-4">Lifetime Predictions</h2>
        {isLoading ? (
          <div className="text-white/50">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-white/50 text-sm border-b border-glass-border">
                  <th className="text-left py-3">Satellite</th>
                  <th className="text-left py-3">Altitude</th>
                  <th className="text-left py-3">Days Remaining</th>
                  <th className="text-left py-3">Status</th>
                  <th className="text-left py-3">Decay Rate</th>
                </tr>
              </thead>
              <tbody>
                {predictions?.slice(0, 20).map((sat, i) => (
                  <tr key={i} className="border-b border-glass-border/50 hover:bg-white/5">
                    <td className="py-3">
                      <div className="text-white font-medium">{sat.name}</div>
                      <div className="text-white/50 text-sm">#{sat.noradCatId}</div>
                    </td>
                    <td className="py-3 text-white">{sat.currentAltitude?.toFixed(1)} km</td>
                    <td className="py-3 text-white">{sat.estimatedLifetimeDays}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(sat.status)}`}>
                        {sat.status?.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-white/70">{sat.decayRateKmPerDay} km/day</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Lifetime;