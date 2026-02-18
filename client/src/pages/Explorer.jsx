import { useState, useEffect, useCallback } from 'react';
import { satelliteApi, riskApi } from '../services/api';

const Explorer = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [satelliteDetails, setSatelliteDetails] = useState(null);
  const [loading, setLoading] = useState(false);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery, handleSearch]);

  const handleSelectSatellite = async (sat) => {
    setSelectedSatellite(sat);
    try {
      const response = await satelliteApi.getById(sat.noradCatId);
      setSatelliteDetails(response.data.data);
    } catch (err) {
      console.error('Error fetching satellite details:', err);
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
                  <div className="w-5 h-5 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {searchResults.map((sat) => (
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
                      <span className={`font-orbitron text-xs ${getRiskColor(sat.riskScore)}`}>
                        {(sat.riskScore * 100).toFixed(1)}%
                      </span>
                      <div className="w-12 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            sat.riskScore < 0.3 ? 'bg-neon-cyan' :
                            sat.riskScore < 0.6 ? 'bg-solar-amber' : 'bg-alert-red'
                          }`}
                          style={{ width: getRiskBarWidth(sat.riskScore) }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {searchQuery.length >= 2 && searchResults.length === 0 && !loading && (
                <p className="text-white/50 text-center py-4">No satellites found</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedSatellite && satelliteDetails ? (
              <div className="glass-card p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="font-orbitron text-2xl font-bold text-white">
                      {satelliteDetails.name}
                    </h2>
                    <p className="text-white/50 mt-1">
                      NORAD ID: {satelliteDetails.noradCatId}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/70 text-sm">Risk Score</p>
                    <p className={`font-orbitron text-3xl ${getRiskColor(satelliteDetails.riskScore)}`}>
                      {(satelliteDetails.riskScore * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        satelliteDetails.riskScore < 0.3 ? 'bg-neon-cyan' :
                        satelliteDetails.riskScore < 0.6 ? 'bg-solar-amber' : 'bg-alert-red'
                      }`}
                      style={{ width: getRiskBarWidth(satelliteDetails.riskScore) }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="glass-card p-4">
                    <p className="text-white/50 text-xs mb-1">Altitude</p>
                    <p className="font-orbitron text-neon-cyan">
                      {satelliteDetails.orbitalAltitude?.toFixed(0) || 'N/A'} km
                    </p>
                  </div>
                  <div className="glass-card p-4">
                    <p className="text-white/50 text-xs mb-1">Inclination</p>
                    <p className="font-orbitron text-white">
                      {satelliteDetails.inclination?.toFixed(2) || 'N/A'}°
                    </p>
                  </div>
                  <div className="glass-card p-4">
                    <p className="text-white/50 text-xs mb-1">Period</p>
                    <p className="font-orbitron text-white">
                      {satelliteDetails.orbitalPeriod?.toFixed(0) || 'N/A'} min
                    </p>
                  </div>
                  <div className="glass-card p-4">
                    <p className="text-white/50 text-xs mb-1">Eccentricity</p>
                    <p className="font-orbitron text-white">
                      {satelliteDetails.eccentricity?.toFixed(4) || 'N/A'}
                    </p>
                  </div>
                </div>

                {satelliteDetails.currentPosition && (
                  <div className="mb-6">
                    <h3 className="font-orbitron text-sm font-semibold text-white mb-3">
                      CURRENT POSITION
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="glass-card p-3">
                        <p className="text-white/50 text-xs mb-1">Latitude</p>
                        <p className="font-orbitron text-sm text-white">
                          {satelliteDetails.currentPosition.latitude?.toFixed(4) || 'N/A'}°
                        </p>
                      </div>
                      <div className="glass-card p-3">
                        <p className="text-white/50 text-xs mb-1">Longitude</p>
                        <p className="font-orbitron text-sm text-white">
                          {satelliteDetails.currentPosition.longitude?.toFixed(4) || 'N/A'}°
                        </p>
                      </div>
                      <div className="glass-card p-3">
                        <p className="text-white/50 text-xs mb-1">Altitude</p>
                        <p className="font-orbitron text-sm text-white">
                          {satelliteDetails.currentPosition.altitude?.toFixed(0) || 'N/A'} km
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {satelliteDetails.orbitalParameters && (
                  <div>
                    <h3 className="font-orbitron text-sm font-semibold text-white mb-3">
                      ORBITAL PARAMETERS
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-white/5 rounded-lg">
                        <p className="text-white/50 text-xs">RAAN</p>
                        <p className="text-white font-mono text-sm">
                          {satelliteDetails.orbitalParameters.raan?.toFixed(2) || 'N/A'}°
                        </p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-lg">
                        <p className="text-white/50 text-xs">Arg of Perigee</p>
                        <p className="text-white font-mono text-sm">
                          {satelliteDetails.orbitalParameters.argumentOfPerigee?.toFixed(2) || 'N/A'}°
                        </p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-lg">
                        <p className="text-white/50 text-xs">Mean Anomaly</p>
                        <p className="text-white font-mono text-sm">
                          {satelliteDetails.orbitalParameters.meanAnomaly?.toFixed(2) || 'N/A'}°
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-card p-12 flex flex-col items-center justify-center h-full min-h-96">
                <div className="w-20 h-20 rounded-full bg-neon-cyan/10 flex items-center justify-center mb-6">
                  <svg className="w-10 h-10 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-white/70 text-center">
                  Select a satellite from the search results to view details
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Explorer;
