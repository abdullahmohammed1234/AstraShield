import { useState, useEffect, useCallback } from 'react';
import { satelliteApi, riskApi } from '../services/api';

const Simulation = () => {
  const [satellites, setSatellites] = useState([]);
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [altitude, setAltitude] = useState(400);
  const [inclination, setInclination] = useState(0);
  const [simulationResult, setSimulationResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSatellites = async () => {
      try {
        const response = await satelliteApi.getAll(50);
        setSatellites(response.data.data || []);
        if (response.data.data?.length > 0) {
          setSelectedSatellite(response.data.data[0]);
          setAltitude(response.data.data[0].orbitalAltitude || 400);
          setInclination(response.data.data[0].inclination || 0);
        }
      } catch (err) {
        console.error('Error fetching satellites:', err);
      }
    };

    fetchSatellites();
  }, []);

  const runSimulation = useCallback(async () => {
    if (!selectedSatellite) return;

    setLoading(true);
    try {
      const response = await riskApi.simulate({
        noradCatId: selectedSatellite.noradCatId,
        newAltitude: parseFloat(altitude),
        newInclination: parseFloat(inclination)
      });
      setSimulationResult(response.data.data);
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSatellite, altitude, inclination]);

  const handleSatelliteChange = (sat) => {
    setSelectedSatellite(sat);
    setAltitude(sat.orbitalAltitude || 400);
    setInclination(sat.inclination || 0);
    setSimulationResult(null);
  };

  const getRiskColor = (score) => {
    if (score < 0.3) return 'text-neon-cyan';
    if (score < 0.6) return 'text-solar-amber';
    return 'text-alert-red';
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-card p-4">
            <h2 className="font-orbitron text-lg font-semibold text-white mb-4">
              SELECT SATELLITE
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {satellites.map((sat) => (
                <div
                  key={sat.noradCatId}
                  onClick={() => handleSatelliteChange(sat)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedSatellite?.noradCatId === sat.noradCatId
                      ? 'bg-neon-cyan/20 border border-neon-cyan/50'
                      : 'bg-white/5 border border-white/5 hover:bg-white/10'
                  }`}
                >
                  <p className="text-white text-sm font-medium truncate">{sat.name}</p>
                  <p className="text-white/50 text-xs">Alt: {sat.orbitalAltitude?.toFixed(0)} km</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card p-6">
              <h2 className="font-orbitron text-lg font-semibold text-white mb-6">
                ORBITAL ADJUSTMENT SIMULATION
              </h2>

              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-white/70 text-sm">Altitude (km)</label>
                    <span className="font-orbitron text-neon-cyan">{altitude} km</span>
                  </div>
                  <input
                    type="range"
                    min="200"
                    max="36000"
                    value={altitude}
                    onChange={(e) => setAltitude(e.target.value)}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-neon-cyan"
                  />
                  <div className="flex justify-between text-xs text-white/30 mt-1">
                    <span>200 (LEO)</span>
                    <span>35786 (GEO)</span>
                    <span>36000</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-white/70 text-sm">Inclination (degrees)</label>
                    <span className="font-orbitron text-neon-cyan">{inclination}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="180"
                    value={inclination}
                    onChange={(e) => setInclination(e.target.value)}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-neon-cyan"
                  />
                  <div className="flex justify-between text-xs text-white/30 mt-1">
                    <span>0° (Equatorial)</span>
                    <span>90° (Polar)</span>
                    <span>180°</span>
                  </div>
                </div>

                <button
                  onClick={runSimulation}
                  disabled={loading || !selectedSatellite}
                  className="neon-button w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Simulating...' : 'Run Simulation'}
                </button>
              </div>
            </div>

            {simulationResult && (
              <div className="glass-card p-6">
                <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
                  SIMULATION RESULTS
                </h3>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="glass-card p-4 border-l-4 border-solar-amber">
                    <p className="text-white/50 text-xs mb-1">Current Risk</p>
                    <p className={`font-orbitron text-2xl ${getRiskColor(simulationResult.currentRisk)}`}>
                      {(simulationResult.currentRisk * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="glass-card p-4 border-l-4 border-neon-cyan">
                    <p className="text-white/50 text-xs mb-1">Projected Risk</p>
                    <p className={`font-orbitron text-2xl ${getRiskColor(simulationResult.projectedRisk)}`}>
                      {(simulationResult.projectedRisk * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white/5 rounded-lg mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-white/70">Risk Improvement</span>
                    <span className={`font-orbitron ${simulationResult.riskReduced ? 'text-neon-cyan' : 'text-alert-red'}`}>
                      {simulationResult.riskReduced ? '↓' : '↑'} {(Math.abs(simulationResult.improvement) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-white/50">Current Altitude</p>
                    <p className="text-white font-mono">{simulationResult.currentAltitude?.toFixed(0)} km</p>
                  </div>
                  <div>
                    <p className="text-white/50">New Altitude</p>
                    <p className="text-white font-mono">{simulationResult.newAltitude?.toFixed(0)} km</p>
                  </div>
                  <div>
                    <p className="text-white/50">Current Inclination</p>
                    <p className="text-white font-mono">{simulationResult.currentInclination?.toFixed(1)}°</p>
                  </div>
                  <div>
                    <p className="text-white/50">New Inclination</p>
                    <p className="text-white font-mono">{simulationResult.newInclination?.toFixed(1)}°</p>
                  </div>
                </div>
              </div>
            )}

            {!simulationResult && selectedSatellite && (
              <div className="glass-card p-8 flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-neon-cyan/10 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-white/70 text-center">
                  Configure altitude and inclination parameters, then run simulation to see risk projections
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Simulation;
