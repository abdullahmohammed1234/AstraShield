import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Legend
} from 'recharts';
import { debrisApi } from '../services/api';

const ORBITAL_SHELLS = ['LEO', 'MEO', 'GEO'];

const DebrisAnalytics = () => {
  const [statistics, setStatistics] = useState(null);
  const [trends, setTrends] = useState({ LEO: [], MEO: [], GEO: [] });
  const [densityData, setDensityData] = useState({ LEO: [], MEO: [], GEO: [] });
  const [growthRates, setGrowthRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeShell, setActiveShell] = useState('LEO');
  const [timeRange, setTimeRange] = useState(12);
  const toast = { error: (msg) => console.error(msg), success: (msg) => console.log(msg) };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Safe fetch wrapper
      const safeFetch = async (promise) => {
        try {
          const res = await promise;
          return res;
        } catch (e) {
          console.error('Fetch error:', e);
          return null;
        }
      };

      // Fetch statistics
      const statsRes = await safeFetch(debrisApi.getStatistics());
      if (statsRes?.data) {
        setStatistics(statsRes.data);
      }

      // Fetch growth rates
      const growthResults = await Promise.all([
        safeFetch(debrisApi.getGrowthRate('LEO', timeRange)),
        safeFetch(debrisApi.getGrowthRate('MEO', timeRange)),
        safeFetch(debrisApi.getGrowthRate('GEO', timeRange))
      ]);
      
      setGrowthRates({
        LEO: growthResults[0]?.data?.data || null,
        MEO: growthResults[1]?.data?.data || null,
        GEO: growthResults[2]?.data?.data || null
      });

      // Fetch trends and density
      const newTrends = {};
      const newDensity = {};
      
      for (const shell of ORBITAL_SHELLS) {
        const trendRes = await safeFetch(debrisApi.getTrends(shell));
        const trendData = Array.isArray(trendRes?.data?.data) ? trendRes.data.data : [];
        newTrends[shell] = trendData.map(t => ({
          date: new Date(t.snapshotDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          count: t.totalObjectCount,
          debris: t.debrisCount,
          satellites: t.satelliteCount,
          density: t.density || 0
        }));

        const densityRes = await safeFetch(debrisApi.getDensity(shell, 30));
        newDensity[shell] = Array.isArray(densityRes?.data?.data) ? densityRes.data.data : [];
      }
      
      setTrends(newTrends);
      setDensityData(newDensity);
      
    } catch (err) {
      console.error('Error fetching debris analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCapture = async () => {
    try {
      await debrisApi.capture();
      toast.success('Debris population captured successfully');
      fetchData();
    } catch (err) {
      toast.error('Failed to capture debris population');
    }
  };

  const handleShellChange = (shell) => {
    setActiveShell(shell);
  };

  const shellColors = {
    LEO: '#22D3EE',
    MEO: '#F59E0B',
    GEO: '#A78BFA'
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num || 0);
  };

  const renderShellCard = (shell) => {
    const stats = statistics ? statistics[shell] : null;
    
    return (
      <div
        key={shell}
        onClick={() => handleShellChange(shell)}
        className={`p-4 rounded-xl border transition-all cursor-pointer ${
          activeShell === shell
            ? 'border-cyan-500 bg-cyan-500/10'
            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold" style={{ 
            color: shell === 'LEO' ? '#22D3EE' : shell === 'MEO' ? '#F59E0B' : '#A78BFA'
          }}>{shell}</span>
          <span className="text-xs text-gray-500">
            {shell === 'LEO' ? '200-2000 km' : shell === 'MEO' ? '2000-35786 km' : '35786 km'}
          </span>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-white">
            {formatNumber(stats?.current?.totalObjectCount || 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Objects</div>
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <div>
            <span className="text-gray-500">Debris: </span>
            <span className="text-red-400">
              {formatNumber(stats?.current?.debrisCount || 0)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Trend: </span>
            <span className={stats?.trend === 'increasing' ? 'text-red-400' : 'text-green-400'}>
              {stats?.trend || 'stable'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Debris Population Analytics</h1>
          <p className="text-gray-400 mt-1">Track and visualize debris density trends over orbital shells</p>
        </div>
        <button
          onClick={handleCapture}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-colors"
        >
          Capture Population
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ORBITAL_SHELLS.map(shell => renderShellCard(shell))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Population Trends</h3>
          <div className="flex gap-2 mb-4">
            {ORBITAL_SHELLS.map(shell => (
              <button
                key={shell}
                onClick={() => setActiveShell(shell)}
                className={`px-3 py-1 rounded text-sm ${
                  activeShell === shell
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {shell}
              </button>
            ))}
          </div>
          <div className="h-64">
            {trends[activeShell]?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends[activeShell]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" tick={{fontSize: 12}} />
                  <YAxis stroke="#9CA3AF" tick={{fontSize: 12}} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#F9FAFB' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke={shellColors[activeShell]} name="Total" dot={false} />
                  <Line type="monotone" dataKey="debris" stroke="#EF4444" name="Debris" dot={false} strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="satellites" stroke="#22C55E" name="Satellites" dot={false} strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                No trend data available
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Altitude Density Distribution</h3>
          <div className="h-64">
            {densityData[activeShell]?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={densityData[activeShell]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="altitude" stroke="#9CA3AF" tick={{fontSize: 12}} tickFormatter={(v) => `${Math.round(v)}`} />
                  <YAxis stroke="#9CA3AF" tick={{fontSize: 12}} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#F9FAFB' }}
                    formatter={(value) => formatNumber(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={shellColors[activeShell]}
                    fill={`${shellColors[activeShell]}30`}
                    name="Objects"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                No density data available
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Growth Rate Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ORBITAL_SHELLS.map(shell => {
            const data = growthRates[shell];
            return (
              <div key={shell} className="p-4 bg-gray-700/30 rounded-lg">
                <div className="text-sm font-medium text-gray-400 mb-2">{shell} Orbital Shell</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {data && data.growthRate && data.growthRate > 0 ? '+' : ''}{formatNumber(data?.growthRate ?? 0)}
                    </div>
                    <div className="text-xs text-gray-500">Monthly Growth</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {(data?.percentChange ?? 0).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">Period Change</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-600">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Start: {formatNumber(data?.startCount)}</span>
                    <span className="text-gray-500">End: {formatNumber(data?.endCount)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        </div>
      )}
      </div>
    </div>
  );
};

export default DebrisAnalytics;