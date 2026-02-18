import { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { riskApi } from '../services/api';

const Analytics = () => {
  const [stats, setStats] = useState(null);
  const [congestion, setCongestion] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, congestionRes] = await Promise.all([
        riskApi.getStatistics(),
        riskApi.getCongestion()
      ]);
      setStats(statsRes.data.data);
      setCongestion(congestionRes.data.data || []);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const riskData = stats ? [
    { name: 'High', value: stats.riskDistribution?.high || 0, color: '#EF4444' },
    { name: 'Medium', value: stats.riskDistribution?.medium || 0, color: '#F59E0B' },
    { name: 'Low', value: stats.riskDistribution?.low || 0, color: '#22D3EE' }
  ] : [];

  const altitudeData = stats ? [
    { name: 'LEO', count: stats.altitudeDistribution?.leo || 0, color: '#22D3EE' },
    { name: 'MEO', count: stats.altitudeDistribution?.meo || 0, color: '#F59E0B' },
    { name: 'GEO', count: stats.altitudeDistribution?.geo || 0, color: '#EF4444' }
  ] : [];

  const congestionChartData = congestion.map((band) => ({
    altitude: `${Math.round(band.altitudeMin)}-${Math.round(band.altitudeMax)}`,
    count: band.satellites.length,
    density: (band.density * 100).toFixed(1)
  }));

  if (loading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin"></div>
          <p className="mt-4 text-white/70">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <p className="text-white/50 text-xs mb-1">Total Objects</p>
            <p className="font-orbitron text-2xl text-neon-cyan">
              {stats?.total?.toLocaleString() || 0}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-white/50 text-xs mb-1">Average Risk</p>
            <p className="font-orbitron text-2xl text-solar-amber">
              {((stats?.averageRisk || 0) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-white/50 text-xs mb-1">High Risk Objects</p>
            <p className="font-orbitron text-2xl text-alert-red">
              {stats?.riskDistribution?.high || 0}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-white/50 text-xs mb-1">Safe Objects</p>
            <p className="font-orbitron text-2xl text-neon-cyan">
              {stats?.riskDistribution?.low || 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card p-6">
            <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
              RISK DISTRIBUTION
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {riskData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B0F1A',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center space-x-6 mt-4">
              {riskData.map((item) => (
                <div key={item.name} className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="text-white/70 text-sm">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
              ORBITAL BAND DISTRIBUTION
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={altitudeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" />
                  <YAxis stroke="rgba(255,255,255,0.5)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B0F1A',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="count">
                    {altitudeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
            CONGESTION BY ALTITUDE BAND
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={congestionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="altitude" 
                  stroke="rgba(255,255,255,0.5)"
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis stroke="rgba(255,255,255,0.5)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B0F1A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#22D3EE" 
                  strokeWidth={2}
                  dot={{ fill: '#22D3EE' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-white/50 text-xs mt-4 text-center">
            Altitude ranges (km) showing satellite density
          </p>
        </div>

        <div className="glass-card p-6">
          <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
            HIGH DENSITY REGIONS
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {congestion
              .filter(band => band.density > 0.5)
              .slice(0, 6)
              .map((band, idx) => (
                <div key={idx} className="p-4 bg-white/5 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white/70 text-sm">
                      {Math.round(band.altitudeMin)} - {Math.round(band.altitudeMax)} km
                    </span>
                    <span className={`font-orbitron text-sm ${
                      band.density > 0.8 ? 'text-alert-red' : 
                      band.density > 0.6 ? 'text-solar-amber' : 'text-neon-cyan'
                    }`}>
                      {(band.density * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        band.density > 0.8 ? 'bg-alert-red' : 
                        band.density > 0.6 ? 'bg-solar-amber' : 'bg-neon-cyan'
                      }`}
                      style={{ width: `${band.density * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-white/50 text-xs mt-2">
                    {band.satellites.length} satellites
                  </p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
