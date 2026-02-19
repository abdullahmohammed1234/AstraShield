import { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend
} from 'recharts';
import { riskApi } from '../services/api';

const Analytics = () => {
  const [stats, setStats] = useState(null);
  const [congestion, setCongestion] = useState([]);
  const [trends, setTrends] = useState([]);
  const [seasonalAnalysis, setSeasonalAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState(30);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, congestionRes, trendsRes] = await Promise.all([
        riskApi.getStatistics(),
        riskApi.getCongestion(),
        riskApi.getTrends({ type: 'daily', days: timeRange })
      ]);
      setStats(statsRes.data.data);
      setCongestion(congestionRes.data.data || []);
      setTrends(trendsRes.data.data || []);
      
      // Also fetch seasonal analysis
      try {
        const seasonalRes = await riskApi.getSeasonalAnalysis(2);
        setSeasonalAnalysis(seasonalRes.data.data);
      } catch (e) {
        console.log('No seasonal data available yet');
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerateSampleData = async () => {
    try {
      await riskApi.generateSampleData(90);
      fetchData();
    } catch (err) {
      console.error('Error generating sample data:', err);
    }
  };

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

  // Transform trends data for charts
  const trendChartData = trends.map(t => ({
    date: new Date(t.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    avgRisk: (t.averageRisk * 100).toFixed(1),
    totalObjects: t.totalObjects,
    highRisk: t.riskDistribution?.high || 0,
    mediumRisk: t.riskDistribution?.medium || 0,
    lowRisk: t.riskDistribution?.low || 0,
    leo: t.orbitalDistribution?.leo || 0,
    meo: t.orbitalDistribution?.meo || 0,
    geo: t.orbitalDistribution?.geo || 0
  }));

  // Seasonal analysis data
  const seasonalChartData = seasonalAnalysis?.launchWindows?.map(w => ({
    month: new Date(2024, w.month - 1, 1).toLocaleDateString('en-US', { month: 'short' }),
    avgRisk: (w.avgRisk * 100).toFixed(1),
    highRiskObjects: w.avgHighRiskObjects || 0,
    totalObjects: w.avgTotalObjects || 0,
    riskLevel: w.riskLevel,
    recommendation: w.recommendation
  })) || [];

  const getRiskLevelColor = (level) => {
    switch (level) {
      case 'low': return '#22C55E';
      case 'medium': return '#F59E0B';
      case 'high': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getRecommendationBadge = (rec) => {
    switch (rec) {
      case 'optimal': return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Optimal' };
      case 'acceptable': return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Acceptable' };
      case 'avoid': return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Avoid' };
      default: return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Unknown' };
    }
  };

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
        {/* Header with tabs */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="font-orbitron text-2xl text-white">RISK ANALYTICS</h1>
          <div className="flex gap-2">
            {['overview', 'trends', 'seasonal'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  activeTab === tab 
                    ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50' 
                    : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
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
          </>
        )}

        {/* Trends Tab */}
        {activeTab === 'trends' && (
          <>
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-2">
                {[7, 30, 90].map(days => (
                  <button
                    key={days}
                    onClick={() => setTimeRange(days)}
                    className={`px-3 py-1 rounded text-sm ${
                      timeRange === days 
                        ? 'bg-neon-cyan/20 text-neon-cyan' 
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
              <button
                onClick={handleGenerateSampleData}
                className="px-4 py-2 bg-neon-cyan/20 text-neon-cyan rounded-lg text-sm hover:bg-neon-cyan/30 transition-colors"
              >
                Generate Demo Data
              </button>
            </div>

            {trendChartData.length > 0 ? (
              <>
                <div className="glass-card p-6">
                  <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                    RISK SCORE EVOLUTION
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="rgba(255,255,255,0.5)" domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0B0F1A',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="avgRisk" 
                          name="Avg Risk %"
                          stroke="#F59E0B" 
                          fill="#F59E0B" 
                          fillOpacity={0.3}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-card p-6">
                  <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                    OBJECT COUNT TREND
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="rgba(255,255,255,0.5)" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0B0F1A',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="totalObjects" 
                          name="Total Objects"
                          stroke="#22D3EE" 
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="highRisk" 
                          name="High Risk"
                          stroke="#EF4444" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass-card p-6">
                  <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                    RISK DISTRIBUTION OVER TIME
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="rgba(255,255,255,0.5)" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0B0F1A',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="highRisk" 
                          name="High Risk"
                          stackId="1"
                          stroke="#EF4444" 
                          fill="#EF4444" 
                          fillOpacity={0.7}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="mediumRisk" 
                          name="Medium Risk"
                          stackId="1"
                          stroke="#F59E0B" 
                          fill="#F59E0B" 
                          fillOpacity={0.7}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="lowRisk" 
                          name="Low Risk"
                          stackId="1"
                          stroke="#22D3EE" 
                          fill="#22D3EE" 
                          fillOpacity={0.7}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            ) : (
              <div className="glass-card p-12 text-center">
                <p className="text-white/50 mb-4">No historical trend data available yet.</p>
                <p className="text-white/30 text-sm mb-6">
                  Click "Generate Demo Data" to create sample historical data for demonstration.
                </p>
                <button
                  onClick={handleGenerateSampleData}
                  className="px-6 py-3 bg-neon-cyan/20 text-neon-cyan rounded-lg hover:bg-neon-cyan/30 transition-colors"
                >
                  Generate Demo Data
                </button>
              </div>
            )}
          </>
        )}

        {/* Seasonal Analysis Tab */}
        {activeTab === 'seasonal' && (
          <>
            <div className="glass-card p-6">
              <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                MONTHLY RISK PATTERNS
              </h3>
              {seasonalChartData.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={seasonalChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" />
                      <YAxis yAxisId="left" stroke="rgba(255,255,255,0.5)" />
                      <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.5)" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0B0F1A',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="avgRisk" name="Avg Risk %" fill="#F59E0B" />
                      <Line yAxisId="right" type="monotone" dataKey="totalObjects" name="Total Objects" stroke="#22D3EE" strokeWidth={2} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-white/50">
                  No seasonal data available. Generate trend data first.
                </div>
              )}
            </div>

            <div className="glass-card p-6">
              <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                LAUNCH WINDOW RECOMMENDATIONS
              </h3>
              {seasonalAnalysis?.launchWindows ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {seasonalChartData.map((month, idx) => {
                    const badge = getRecommendationBadge(month.recommendation);
                    return (
                      <div key={idx} className="p-4 bg-white/5 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-white font-medium">{month.month}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-white/50">Risk:</span>
                            <span style={{ color: getRiskLevelColor(month.riskLevel) }}>
                              {month.avgRisk}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/50">Objects:</span>
                            <span className="text-white/70">{month.totalObjects}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-white/50 py-8">
                  No launch window recommendations available yet.
                </div>
              )}
            </div>

            {seasonalAnalysis && (
              <div className="glass-card p-6">
                <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                  SEASONAL INSIGHTS
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                    <h4 className="text-green-400 font-medium mb-2">Optimal Launch Months</h4>
                    <p className="text-white/70 text-sm">
                      {seasonalAnalysis.optimalMonths?.length > 0 
                        ? seasonalAnalysis.optimalMonths.map(m => 
                            new Date(2024, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })
                          ).join(', ')
                        : 'None identified'
                      }
                    </p>
                    <p className="text-white/50 text-xs mt-2">
                      Lowest historical risk periods for satellite launches
                    </p>
                  </div>
                  <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                    <h4 className="text-red-400 font-medium mb-2">High-Risk Periods</h4>
                    <p className="text-white/70 text-sm">
                      {seasonalAnalysis.avoidMonths?.length > 0 
                        ? seasonalAnalysis.avoidMonths.map(m => 
                            new Date(2024, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })
                          ).join(', ')
                        : 'None identified'
                      }
                    </p>
                    <p className="text-white/50 text-xs mt-2">
                      Consider delaying launches during these periods
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Analytics;
