import { useState, useEffect, useCallback } from 'react';
import { satelliteApi, riskApi } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { SkeletonList, SkeletonCard } from '../components/ui/Skeleton';

const Explorer = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [satelliteDetails, setSatelliteDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const toast = useToast();

  const handleSearch = useCallback(async (query) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      const response = await satelliteApi.search(query, 20);
      setSearchResults(response.data.data || []);
    } catch (err) {
      console.error('Search error:', err);
      toast.error('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery, handleSearch]);

  const handleSelectSatellite = async (sat) => {
    setSelectedSatellite(sat);
    try {
      setDetailsLoading(true);
      const response = await satelliteApi.getById(sat.noradCatId);
      setSatelliteDetails(response.data.data);
    } catch (err) {
      console.error('Error fetching satellite details:', err);
      toast.error('Failed to load satellite details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const getRiskColor = (score) => {
    if (score < 0.3) return 'text-neon-cyan';
    if (score < 0.6) return 'text-solar-amber';
    return 'text-alert-red';
  };

  const getRiskBarWidth = (score) => {
    return `${score * 100}%`;
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-card p-4">
            <h2 className="font-orbitron text-lg font-semibold text-white mb-4">
              SATELLITE EXPLORER
            </h2>
            
            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Search satellites by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-neon-cyan/50 transition-colors"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-r from-white/5 via-white/10 to-white/5 animate-pulse"></div>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-3 rounded-lg bg-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-white/5 via-white/10 to-white/5 animate-pulse"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-3/4 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
                          <div className="h-3 w-1/2 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchResults.length === 0 && searchQuery.length >= 2 ? (
                <div className="text-center text-white/50 py-8">
                  No satellites found
                </div>
              ) : (
                searchResults.map((sat) => (
                  <div
                    key={sat.noradCatId}
                    onClick={() => handleSelectSatellite(sat)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      selectedSatellite?.noradCatId === sat.noradCatId
                        ? 'bg-neon-cyan/20 border border-neon-cyan/50'
                        : 'bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-medium text-sm truncate">
                          {sat.name}
                        </p>
                        <p className="text-white/50 text-xs">
                          NORAD: {sat.noradCatId}
                        </p>
                      </div>
                      <div className="flex flex-col items-end">
                        {sat.riskScore !== undefined && (
                          <>
                            <span className={`font-orbitron text-xs ${getRiskColor(sat.riskScore)}`}>
                              {(sat.riskScore * 100).toFixed(1)}%
                            </span>
                            <div className="w-16 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${sat.riskScore < 0.3 ? 'bg-neon-cyan' : sat.riskScore < 0.6 ? 'bg-solar-amber' : 'bg-alert-red'}`}
                                style={{ width: getRiskBarWidth(sat.riskScore) }}
                              ></div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            {detailsLoading ? (
              <div className="glass-card p-6">
                <div className="space-y-4">
                  <div className="h-8 w-3/4 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
                  <div className="h-4 w-1/2 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="h-20 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
                    <div className="h-20 bg-gradient-to-r from-white/5 via-white/10 to-white/5 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            ) : selectedSatellite && satelliteDetails ? (
              <div className="glass-card p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="font-orbitron text-xl font-semibold text-white">
                      {satelliteDetails.name || selectedSatellite.name}
                    </h2>
                    <p className="text-white/50">NORAD ID: {selectedSatellite.noradCatId}</p>
                  </div>
                  {satelliteDetails.riskScore !== undefined && (
                    <div className="text-right">
                      <span className={`font-orbitron text-2xl ${getRiskColor(satelliteDetails.riskScore)}`}>
                        {(satelliteDetails.riskScore * 100).toFixed(1)}%
                      </span>
                      <p className="text-white/50 text-xs">Risk Score</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white/50 text-sm mb-1">Altitude</p>
                    <p className="text-white font-medium">
                      {satelliteDetails.orbit?.altitude?.toFixed(1) || '-'} km
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white/50 text-sm mb-1">Inclination</p>
                    <p className="text-white font-medium">
                      {satelliteDetails.orbit?.inclination?.toFixed(1) || '-'}°
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white/50 text-sm mb-1">Orbital Period</p>
                    <p className="text-white font-medium">
                      {satelliteDetails.orbit?.period?.toFixed(1) || '-'} min
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white/50 text-sm mb-1">Launch Date</p>
                    <p className="text-white font-medium">
                      {satelliteDetails.launchDate || '-'}
                    </p>
                  </div>
                </div>

                {satelliteDetails.riskScore !== undefined && (
                  <div className="mb-6">
                    <p className="text-white/50 text-sm mb-2">Risk Assessment</p>
                    <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          satelliteDetails.riskScore < 0.3 ? 'bg-neon-cyan' : 
                          satelliteDetails.riskScore < 0.6 ? 'bg-solar-amber' : 'bg-alert-red'
                        }`}
                        style={{ width: getRiskBarWidth(satelliteDetails.riskScore) }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-white/50 mt-1">
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-white/50 text-sm mb-2">Description</p>
                  <p className="text-white/70 text-sm">
                    {satelliteDetails.description || 'No description available.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="glass-card p-6 flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                    <span className="text-3xl">🛰️</span>
                  </div>
                  <p className="text-white/50">Select a satellite to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Explorer;
