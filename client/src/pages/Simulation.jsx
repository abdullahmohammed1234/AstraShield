import { useState, useEffect, useCallback } from 'react';
import { satelliteApi, riskApi } from '../services/api';
import LaunchWindowAnalyzer from '../components/LaunchWindowAnalyzer';

const Simulation = () => {
  const [satellites, setSatellites] = useState([]);
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [altitude, setAltitude] = useState(400);
  const [inclination, setInclination] = useState(0);
  const [simulationResult, setSimulationResult] = useState(null);
  const [maneuverAnalysis, setManeuverAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [viewMode, setViewMode] = useState('single'); // 'single', 'compare', or 'launch-window'
  const [customScenarios, setCustomScenarios] = useState([]); // Custom scenarios with persistence
  const [showAddScenario, setShowAddScenario] = useState(false);
  const [newScenario, setNewScenario] = useState({ altitude: 400, inclination: 0, name: '' });

  // Load custom scenarios from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('customScenarios');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // If we have a selected satellite, filter scenarios for that satellite
        if (selectedSatellite) {
          const filtered = parsed.filter(s => s.noradCatId === selectedSatellite.noradCatId);
          setCustomScenarios(filtered);
        } else {
          setCustomScenarios(parsed);
        }
      } catch (e) {
        console.error('Error loading custom scenarios:', e);
      }
    }
  }, [selectedSatellite]);

  // Save custom scenarios to localStorage when they change
  useEffect(() => {
    // Get existing scenarios from localStorage
    const saved = localStorage.getItem('customScenarios');
    let existing = [];
    if (saved) {
      try {
        existing = JSON.parse(saved);
      } catch (e) {
        existing = [];
      }
    }

    // Filter out scenarios for current satellite and add new ones
    if (selectedSatellite) {
      const otherScenarios = existing.filter(s => s.noradCatId !== selectedSatellite.noradCatId);
      const currentSatScenarios = customScenarios.map(s => ({
        ...s,
        noradCatId: selectedSatellite.noradCatId
      }));
      localStorage.setItem('customScenarios', JSON.stringify([...otherScenarios, ...currentSatScenarios]));
    }
  }, [customScenarios, selectedSatellite]);

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

  // Fetch maneuver analysis when satellite changes
  useEffect(() => {
    const fetchManeuverAnalysis = async () => {
      if (!selectedSatellite) return;
      
      setAnalyzing(true);
      try {
        const response = await riskApi.getManeuverOptions(selectedSatellite.noradCatId);
        setManeuverAnalysis(response.data.data);
      } catch (err) {
        console.error('Error fetching maneuver analysis:', err);
        setManeuverAnalysis(null);
      } finally {
        setAnalyzing(false);
      }
    };

    fetchManeuverAnalysis();
  }, [selectedSatellite]);

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
    // Don't clear custom scenarios - they are filtered by satellite ID
  };

  // NEW: Add custom scenario
  const handleAddCustomScenario = async () => {
    if (!selectedSatellite || !newScenario.altitude) return;
    
    const scenario = {
      altitude: parseFloat(newScenario.altitude),
      inclination: parseFloat(newScenario.inclination),
      name: newScenario.name || `Custom (${newScenario.altitude}km, ${newScenario.inclination}°)`
    };

    try {
      const response = await riskApi.compareManeuvers({
        noradCatId: selectedSatellite.noradCatId,
        scenarios: [scenario]
      });
      
      const result = response.data.data;
      if (result.scenarios?.[0]) {
        setCustomScenarios([...customScenarios, { 
          ...result.scenarios[0], 
          id: `custom-${Date.now()}`,
          name: scenario.name,
          isCustom: true
        }]);
      }
    } catch (err) {
      console.error('Error adding custom scenario:', err);
    }
    
    setShowAddScenario(false);
    setNewScenario({ altitude: 400, inclination: 0, name: '' });
  };

  // NEW: Remove custom scenario
  const handleRemoveCustomScenario = (id) => {
    setCustomScenarios(customScenarios.filter(s => s.id !== id));
  };

  // NEW: Combine predefined and custom scenarios for display
  const getAllScenarios = () => {
    const predefined = maneuverAnalysis?.scenarios || [];
    return [...predefined, ...customScenarios];
  };

  const getRiskColor = (score) => {
    if (score < 0.3) return 'text-neon-cyan';
    if (score < 0.6) return 'text-solar-amber';
    return 'text-alert-red';
  };

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-neon-cyan';
    if (score >= 40) return 'text-solar-amber';
    return 'text-alert-red';
  };

  const getPriorityBadge = (priority) => {
    const styles = {
      'low-cost': 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30',
      'balanced': 'bg-solar-amber/20 text-solar-amber border-solar-amber/30',
      'effective': 'bg-neon-green/20 text-neon-green border-neon-green/30',
      'high-cost': 'bg-alert-red/20 text-alert-red border-alert-red/30',
      'specialized': 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
    return styles[priority] || 'bg-white/10 text-white/70 border-white/20';
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="font-orbitron text-2xl font-bold text-white">
              ORBITAL MANEUVER SIMULATION
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Compare multiple maneuver options with Delta-V cost analysis
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('single')}
              className={`px-4 py-2 rounded-lg font-orbitron text-sm transition-all ${
                viewMode === 'single'
                  ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                  : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
              }`}
            >
              Single Simulation
            </button>
            <button
              onClick={() => setViewMode('compare')}
              className={`px-4 py-2 rounded-lg font-orbitron text-sm transition-all ${
                viewMode === 'compare'
                  ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                  : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
              }`}
            >
              Multi-Scenario Compare
            </button>
            <button
              onClick={() => setViewMode('launch-window')}
              className={`px-4 py-2 rounded-lg font-orbitron text-sm transition-all ${
                viewMode === 'launch-window'
                  ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                  : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
              }`}
            >
              Launch Window
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Satellite Selection */}
          <div className="glass-card p-4 h-fit lg:sticky lg:top-4">
            <h2 className="font-orbitron text-lg font-semibold text-white mb-4">
              SELECT SATELLITE
            </h2>
            <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
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

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {viewMode === 'single' ? (
              // Single Simulation Mode
              <>
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
              </>
            ) : viewMode === 'launch-window' ? (
              // Launch Window Analyzer
              <LaunchWindowAnalyzer />
            ) : (
              // Multi-Scenario Compare Mode
              <>
                {/* Best Option Recommendation */}
                {maneuverAnalysis?.bestOption && (
                  <div className="glass-card p-6 border-2 border-neon-cyan/30 bg-neon-cyan/5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-neon-cyan/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-orbitron text-lg font-semibold text-neon-cyan">
                            RECOMMENDED OPTION
                          </h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityBadge(maneuverAnalysis.bestOption.priority)}`}>
                            {maneuverAnalysis.bestOption.priority?.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-white font-medium mb-3">
                          {maneuverAnalysis.bestOption.name}
                        </p>
                        <p className="text-white/60 text-sm mb-4">
                          {maneuverAnalysis.bestOption.description}
                        </p>
                        
                        <div className="grid grid-cols-4 gap-4">
                          <div className="text-center">
                            <p className="text-white/40 text-xs">Delta-V</p>
                            <p className="font-orbitron text-neon-cyan">
                              {maneuverAnalysis.bestOption.deltaV?.total?.toFixed(2)} km/s
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-white/40 text-xs">Fuel Est.</p>
                            <p className="font-orbitron text-white">
                              {maneuverAnalysis.bestOption.fuel?.massKg?.toFixed(1)} kg
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-white/40 text-xs">Risk Reduction</p>
                            <p className="font-orbitron text-neon-green">
                              {maneuverAnalysis.bestOption.risk?.reduction > 0 ? '↓' : '—'} 
                              {(maneuverAnalysis.bestOption.risk?.reduction * 100)?.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-white/40 text-xs">Score</p>
                            <p className={`font-orbitron ${getScoreColor(maneuverAnalysis.bestOption.score?.totalScore)}`}>
                              {maneuverAnalysis.bestOption.score?.totalScore?.toFixed(0)}/100
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scenario Comparison */}
                <div className="glass-card p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="font-orbitron text-lg font-semibold text-white">
                      MANEUVER OPTIONS COMPARISON
                    </h2>
                    <button
                      onClick={() => setShowAddScenario(true)}
                      className="px-4 py-2 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 rounded-lg hover:bg-neon-cyan/30 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Custom Scenario
                    </button>
                  </div>

                  {analyzing ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neon-cyan"></div>
                      <span className="ml-3 text-white/60">Analyzing maneuver options...</span>
                    </div>
                  ) : getAllScenarios().length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left text-white/50 text-xs font-medium py-3 px-2">OPTION</th>
                            <th className="text-left text-white/50 text-xs font-medium py-3 px-2">ALTITUDE</th>
                            <th className="text-left text-white/50 text-xs font-medium py-3 px-2">INCLINATION</th>
                            <th className="text-right text-white/50 text-xs font-medium py-3 px-2">ΔV (km/s)</th>
                            <th className="text-right text-white/50 text-xs font-medium py-3 px-2">FUEL (kg)</th>
                            <th className="text-right text-white/50 text-xs font-medium py-3 px-2">RISK CHANGE</th>
                            <th className="text-right text-white/50 text-xs font-medium py-3 px-2">SCORE</th>
                            <th className="text-right text-white/50 text-xs font-medium py-3 px-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {getAllScenarios().map((scenario, index) => {
                            const isBest = (maneuverAnalysis?.bestOption?.id === scenario.id) || 
                              (customScenarios.length > 0 && scenario.riskReduction === Math.max(...getAllScenarios().map(s => s.riskReduction)));
                            return (
                              <tr 
                                key={scenario.id}
                                className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                                  isBest ? 'bg-neon-cyan/10' : ''
                                }`}
                              >
                                <td className="py-3 px-2">
                                  <div className="flex items-center gap-2">
                                    {isBest && (
                                      <span className="w-2 h-2 rounded-full bg-neon-cyan"></span>
                                    )}
                                    <div>
                                      <p className={`text-sm font-medium ${isBest ? 'text-neon-cyan' : 'text-white'}`}>
                                        {scenario.name}
                                        {scenario.isCustom && <span className="ml-2 text-xs text-purple-400">(Custom)</span>}
                                      </p>
                                      <p className="text-xs text-white/40">{scenario.description || 'Custom scenario'}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-2 text-white font-mono text-sm">
                                  {scenario.newAltitude?.toFixed(0) || scenario.altitude?.toFixed(0)} km
                                </td>
                                <td className="py-3 px-2 text-white font-mono text-sm">
                                  {scenario.newInclination?.toFixed(1) || scenario.inclination?.toFixed(1)}°
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className={`font-mono text-sm ${
                                    (scenario.deltaV?.total || scenario.deltaV) < 0.5 ? 'text-neon-cyan' :
                                    (scenario.deltaV?.total || scenario.deltaV) < 1.5 ? 'text-solar-amber' : 'text-alert-red'
                                  }`}>
                                    {(scenario.deltaV?.total || scenario.deltaV || 0).toFixed(3)}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-right text-white font-mono text-sm">
                                  {scenario.fuelKg?.toFixed(1) || scenario.fuel?.massKg?.toFixed(1) || '—'}
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className={`font-mono text-sm ${
                                    (scenario.riskReduction || scenario.risk?.reduction) > 0 ? 'text-neon-green' :
                                    (scenario.riskReduction || scenario.risk?.reduction) < 0 ? 'text-alert-red' : 'text-white/60'
                                  }`}>
                                    {(scenario.riskReduction || scenario.risk?.reduction || 0) > 0 ? '↓' : (scenario.riskReduction || scenario.risk?.reduction || 0) < 0 ? '↑' : '—'}
                                    {((Math.abs(scenario.riskReduction || scenario.risk?.reduction || 0)) * 100)?.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-2 bg-white/10 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full ${
                                          (scenario.score?.totalScore ?? (scenario.riskReduction > 0 ? 60 : 30)) >= 70 ? 'bg-neon-cyan' :
                                          (scenario.score?.totalScore ?? (scenario.riskReduction > 0 ? 60 : 30)) >= 40 ? 'bg-solar-amber' : 'bg-alert-red'
                                        }`}
                                        style={{ width: `${scenario.score?.totalScore ?? (scenario.riskReduction > 0 ? 60 : 30)}%` }}
                                      ></div>
                                    </div>
                                    <span className={`font-orbitron text-sm w-8 text-right ${getScoreColor(scenario.score?.totalScore ?? (scenario.riskReduction > 0 ? 60 : 30))}`}>
                                      {scenario.score?.totalScore != null ? Math.round(scenario.score.totalScore) : (scenario.riskReduction > 0 ? 60 : 30)}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  {scenario.isCustom && (
                                    <button
                                      onClick={() => handleRemoveCustomScenario(scenario.id)}
                                      className="text-white/40 hover:text-alert-red transition-colors"
                                    >
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-white/50">
                      <p>Select a satellite to see maneuver options</p>
                    </div>
                  )}
                </div>

                {/* Delta-V Explanation */}
                <div className="glass-card p-4">
                  <h3 className="font-orbitron text-sm font-semibold text-white/70 mb-3">
                    UNDERSTANDING DELTA-V
                  </h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 rounded-full bg-neon-cyan"></div>
                        <span className="text-white/70 font-medium">Low (&lt;0.5 km/s)</span>
                      </div>
                      <p className="text-white/40 text-xs">
                        Minor adjustments, minimal fuel required
                      </p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 rounded-full bg-solar-amber"></div>
                        <span className="text-white/70 font-medium">Medium (0.5-1.5 km/s)</span>
                      </div>
                      <p className="text-white/40 text-xs">
                        Moderate maneuvers, significant altitude changes
                      </p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 rounded-full bg-alert-red"></div>
                        <span className="text-white/70 font-medium">High (&gt;1.5 km/s)</span>
                      </div>
                      <p className="text-white/40 text-xs">
                        Major maneuvers, large inclination changes
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Add Custom Scenario Modal */}
        {showAddScenario && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="glass-card p-6 w-full max-w-md mx-4">
              <h3 className="font-orbitron text-lg font-semibold text-white mb-4">
                Add Custom Scenario
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm">Scenario Name (optional)</label>
                  <input
                    type="text"
                    value={newScenario.name}
                    onChange={(e) => setNewScenario({ ...newScenario, name: e.target.value })}
                    placeholder="My Custom Maneuver"
                    className="w-full mt-1 p-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-neon-cyan/50 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-white/70 text-sm">Altitude (km)</label>
                    <span className="font-orbitron text-neon-cyan">{newScenario.altitude} km</span>
                  </div>
                  <input
                    type="range"
                    min="200"
                    max="36000"
                    value={newScenario.altitude}
                    onChange={(e) => setNewScenario({ ...newScenario, altitude: parseInt(e.target.value) })}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-neon-cyan"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-white/70 text-sm">Inclination (degrees)</label>
                    <span className="font-orbitron text-neon-cyan">{newScenario.inclination}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="180"
                    value={newScenario.inclination}
                    onChange={(e) => setNewScenario({ ...newScenario, inclination: parseInt(e.target.value) })}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-neon-cyan"
                  />
                </div>

                <div className="p-4 bg-white/5 rounded-lg">
                  <p className="text-white/50 text-xs mb-2">PREVIEW</p>
                  <p className="text-white">
                    Target: {newScenario.altitude} km at {newScenario.inclination}° inclination
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddScenario(false)}
                  className="flex-1 px-4 py-3 bg-white/5 text-white border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCustomScenario}
                  className="flex-1 px-4 py-3 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 rounded-lg hover:bg-neon-cyan/30 transition-colors"
                >
                  Add Scenario
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Simulation;
