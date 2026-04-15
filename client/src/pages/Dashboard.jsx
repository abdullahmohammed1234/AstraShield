import { useState, useCallback, Suspense, lazy } from 'react';
import ConjunctionPanel from '../components/Dashboard/ConjunctionPanel';
import { useSatellitePositions, useSatelliteStatistics, useRiskAlerts } from '../hooks/useQueries';
import { Skeleton } from '../components/ui/Skeleton';

// Lazy load the heavy GlobeScene component for better initial load performance
const GlobeScene = lazy(() => import('../components/Globe/GlobeScene'));

// Loading fallback for GlobeScene with skeleton
const GlobeSceneFallback = () => (
  <div className="w-full h-full flex items-center justify-center bg-deep-space/30 rounded-lg">
    <div className="text-center space-y-3">
      <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-r from-white/5 via-white/10 to-white/5 animate-pulse"></div>
      <p className="text-white/50 text-sm">Loading 3D visualization...</p>
    </div>
  </div>
);

// Statistics card skeleton
const StatCard = ({ title, value, color }) => (
  <div className="glass-card p-4">
    <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
      {title}
    </h3>
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-white/70 text-sm">Total Objects</span>
        <span className={`font-orbitron text-xl ${color}`}>
          {value.toLocaleString()}
        </span>
      </div>
      <div className="h-px bg-white/10"></div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-neon-cyan text-xs">LEO</p>
          <p className="font-orbitron text-sm">-</p>
        </div>
        <div>
          <p className="text-solar-amber text-xs">MEO</p>
          <p className="font-orbitron text-sm">-</p>
        </div>
        <div>
          <p className="text-alert-red text-xs">GEO</p>
          <p className="font-orbitron text-sm">-</p>
        </div>
      </div>
    </div>
  </div>
);

// Skeleton for statistics section
const StatisticsSkeleton = () => (
  <div className="glass-card p-4">
    <div className="h-6 w-40 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse mb-4"></div>
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-white/70 text-sm">Total Objects</span>
        <div className="h-6 w-16 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
      </div>
      <div className="h-px bg-white/10"></div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="h-3 w-8 mx-auto bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
          <div className="h-4 w-8 mx-auto mt-1 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
        </div>
        <div>
          <div className="h-3 w-8 mx-auto bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
          <div className="h-4 w-8 mx-auto mt-1 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
        </div>
        <div>
          <div className="h-3 w-8 mx-auto bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
          <div className="h-4 w-8 mx-auto mt-1 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  </div>
);

// Skeleton for alerts section
const AlertsSkeleton = () => (
  <div className="glass-card p-4">
    <div className="h-6 w-40 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse mb-4"></div>
    <div className="space-y-2 max-h-64">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-card p-3">
          <div className="h-4 w-3/4 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse mb-2"></div>
          <div className="flex justify-between">
            <div className="h-3 w-20 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
            <div className="h-3 w-12 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const Dashboard = () => {
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [selectedConjunction, setSelectedConjunction] = useState(null);
  
  // Use React Query hooks for automatic caching and revalidation
  const { 
    data: positionsData, 
    isLoading: positionsLoading, 
    isError: positionsError,
    refetch: refetchPositions 
  } = useSatellitePositions(300);
  
  const { 
    data: statsData, 
    isLoading: statsLoading 
  } = useSatelliteStatistics();
  
  const { 
    data: alertsData, 
    isLoading: alertsLoading 
  } = useRiskAlerts();

  const satellites = positionsData?.data || [];
  const stats = statsData?.data || { total: 0, byAltitude: {}, byRisk: {} };
  const alerts = alertsData?.data || [];

  const fetchOrbitPath = useCallback(async (sat) => {
    if (!sat || !sat.noradCatId) return null;
    try {
      const { satelliteApi } = await import('../services/api');
      const orbitRes = await satelliteApi.getOrbit(sat.noradCatId);
      return orbitRes.data.data || null;
    } catch (err) {
      console.error('Error fetching orbit:', err);
      return null;
    }
  }, []);

  const handleSatelliteClick = async (sat) => {
    const orbit = await fetchOrbitPath(sat);
    setSelectedSatellite({ ...sat, orbit });
  };

  const getRiskColor = (score) => {
    if (score < 0.3) return 'text-neon-cyan';
    if (score < 0.6) return 'text-solar-amber';
    return 'text-alert-red';
  };

  const loading = positionsLoading || statsLoading || alertsLoading;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <div className="glass-card p-4 h-[600px] relative">
              {/* Loading overlay with skeleton instead of spinner */}
              {loading && (
                <div className="absolute inset-0 z-10 bg-deep-space/30 rounded-lg flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-white/5 via-white/10 to-white/5 animate-pulse"></div>
                    <p className="text-white/50">Loading orbital data...</p>
                  </div>
                </div>
              )}
              
              {/* Error state */}
              {positionsError && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-deep-space/80">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-alert-red/20 flex items-center justify-center">
                      <span className="text-3xl">⚠</span>
                    </div>
                    <p className="text-alert-red mb-4">Failed to load satellite data</p>
                    <button onClick={() => refetchPositions()} className="neon-button">
                      Try Again
                    </button>
                  </div>
                </div>
              )}
              
              <Suspense fallback={<GlobeSceneFallback />}>
                <GlobeScene
                  satellites={satellites}
                  selectedSatellite={selectedSatellite}
                  onSatelliteClick={handleSatelliteClick}
                  selectedConjunction={selectedConjunction}
                  autoRotate={true}
                  showOrbits={false}
                  showForecast={true}
                  showConjunctionAnimation={true}
                />
              </Suspense>
              
              <div className="absolute top-4 left-4 glass-card px-4 py-2">
                <div className="flex items-center space-x-4 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-neon-cyan"></span>
                    <span className="text-white/70">Low Risk</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-solar-amber"></span>
                    <span className="text-white/70">Medium Risk</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full bg-alert-red"></span>
                    <span className="text-white/70">High Risk</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <ConjunctionPanel onConjunctionSelect={setSelectedConjunction} />
            
            {/* Orbital Statistics - with skeleton */}
            {statsLoading ? (
              <StatisticsSkeleton />
            ) : (
              <div className="glass-card p-4">
                <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                  ORBITAL STATISTICS
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white/70 text-sm">Total Objects</span>
                    <span className="font-orbitron text-xl text-neon-cyan">
                      {stats.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-px bg-white/10"></div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-neon-cyan text-xs">LEO</p>
                      <p className="font-orbitron text-sm">{stats.byAltitude?.leo || 0}</p>
                    </div>
                    <div>
                      <p className="text-solar-amber text-xs">MEO</p>
                      <p className="font-orbitron text-sm">{stats.byAltitude?.meo || 0}</p>
                    </div>
                    <div>
                      <p className="text-alert-red text-xs">GEO</p>
                      <p className="font-orbitron text-sm">{stats.byAltitude?.geo || 0}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Risk Distribution */}
            {statsLoading ? (
              <StatisticsSkeleton />
            ) : (
              <div className="glass-card p-4">
                <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                  RISK DISTRIBUTION
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-alert-red"></span>
                      <span className="text-white/70 text-sm">High Risk</span>
                    </div>
                    <span className="font-orbitron text-alert-red">
                      {stats.byRisk?.high || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-solar-amber"></span>
                      <span className="text-white/70 text-sm">Medium Risk</span>
                    </div>
                    <span className="font-orbitron text-solar-amber">
                      {stats.byRisk?.medium || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-neon-cyan"></span>
                      <span className="text-white/70 text-sm">Low Risk</span>
                    </div>
                    <span className="font-orbitron text-neon-cyan">
                      {stats.byRisk?.low || 0}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* High Risk Alerts */}
            {alertsLoading ? (
              <AlertsSkeleton />
            ) : (
              <div className="glass-card p-4">
                <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                  HIGH RISK ALERTS
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <p className="text-white/50 text-sm text-center py-4">
                      No high risk alerts
                    </p>
                  ) : (
                    alerts.slice(0, 5).map((alert, idx) => (
                      <div
                        key={idx}
                        className="glass-card p-3 border border-alert-red/20 hover:border-alert-red/50 transition-colors cursor-pointer"
                      >
                        <p className="text-white text-sm font-medium truncate">
                          {alert.name}
                        </p>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-white/50 text-xs">
                            NORAD: {alert.noradCatId}
                          </span>
                          <span className={`font-orbitron text-xs ${getRiskColor(alert.riskScore)}`}>
                            {(alert.riskScore * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
