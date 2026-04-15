import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

const MissionPlanning = () => {
  const [params, setParams] = useState({
    missionType: 'general',
    desiredAltitude: 400,
    desiredInclination: 0,
    priority: 'both'
  });
  const [analysis, setAnalysis] = useState(null);
  const [options, setOptions] = useState(null);

  const { data: shellData } = useQuery({
    queryKey: ['shellRecommendations', 'leo'],
    queryFn: () => api.get('/mission-planning/shell-recommendations/leo').then(r => r.data)
  });

  const handleAnalyze = async () => {
    try {
      const res = await api.post('/mission-planning/optimal-orbit', params);
      setAnalysis(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFindOptions = async () => {
    try {
      const res = await api.post('/mission-planning/low-risk-options', {
        minAltitude: 200,
        maxAltitude: 1200,
        inclination: params.desiredInclination
      });
      setOptions(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-orbitron font-bold text-white">Mission Planning</h1>
        <span className="text-neon-cyan text-sm">Optimal Orbit Selection</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
          <h2 className="text-xl font-semibold text-white mb-4">Mission Parameters</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Mission Type</label>
              <select
                value={params.missionType}
                onChange={(e) => setParams({ ...params, missionType: e.target.value })}
                className="w-full bg-space-dark border border-glass-border rounded-lg px-4 py-2 text-white"
              >
                <option value="general">General</option>
                <option value="observation">Earth Observation</option>
                <option value="communication">Communication</option>
                <option value="navigation">Navigation</option>
                <option value="weather">Weather</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">Target Altitude (km)</label>
              <input
                type="number"
                value={params.desiredAltitude}
                onChange={(e) => setParams({ ...params, desiredAltitude: parseInt(e.target.value) })}
                className="w-full bg-space-dark border border-glass-border rounded-lg px-4 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">Inclination (degrees)</label>
              <input
                type="number"
                value={params.desiredInclination}
                onChange={(e) => setParams({ ...params, desiredInclination: parseFloat(e.target.value) })}
                className="w-full bg-space-dark border border-glass-border rounded-lg px-4 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">Priority</label>
              <select
                value={params.priority}
                onChange={(e) => setParams({ ...params, priority: e.target.value })}
                className="w-full bg-space-dark border border-glass-border rounded-lg px-4 py-2 text-white"
              >
                <option value="both">Debris Risk & Lifetime</option>
                <option value="debris">Debris Risk Only</option>
                <option value="longevity">Lifetime Only</option>
              </select>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleAnalyze}
                className="flex-1 bg-neon-cyan/20 hover:bg-neon-cyan/30 text-neon-cyan py-2 rounded-lg border border-neon-cyan/30"
              >
                Analyze Optimal Orbit
              </button>
              <button
                onClick={handleFindOptions}
                className="flex-1 bg-cosmic-blue/20 hover:bg-cosmic-blue/30 text-cosmic-blue py-2 rounded-lg border border-cosmic-blue/30"
              >
                Find Low-Risk Options
              </button>
            </div>
          </div>
        </div>

        <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
          <h2 className="text-xl font-semibold text-white mb-4">Orbital Shell Recommendations</h2>
          <div className="space-y-3">
            {['vleo', 'leo', 'meo', 'geo'].map((shell) => (
              <div key={shell} className="flex items-center justify-between p-3 bg-space-dark rounded-lg">
                <div>
                  <span className="text-white font-medium uppercase">{shell}</span>
                  <span className="text-white/50 text-sm ml-2">
                    {shell === 'vleo' ? '200-300 km' : shell === 'leo' ? '300-2000 km' : shell === 'meo' ? '2000-35786 km' : '35786+ km'}
                  </span>
                </div>
                <span className={`text-sm ${shell === 'leo' ? 'text-yellow-400' : 'text-green-400'}`}>
                  {shell === 'leo' ? 'High Traffic' : 'Low Debris'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {analysis && (
        <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
          <h2 className="text-xl font-semibold text-white mb-4">Optimal Orbit Analysis</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-space-dark rounded-lg">
              <div className="text-white/50 text-sm">Altitude</div>
              <div className="text-2xl text-neon-cyan">{analysis.optimalOrbit?.altitude} km</div>
            </div>
            <div className="p-4 bg-space-dark rounded-lg">
              <div className="text-white/50 text-sm">Suitability</div>
              <div className="text-2xl text-neon-cyan">{analysis.optimalOrbit?.suitabilityScore}/100</div>
            </div>
            <div className="p-4 bg-space-dark rounded-lg">
              <div className="text-white/50 text-sm">Collision Risk</div>
              <div className="text-2xl text-neon-cyan">{analysis.optimalOrbit?.collisionRiskScore}</div>
            </div>
            <div className="p-4 bg-space-dark rounded-lg">
              <div className="text-white/50 text-sm">Est. Lifetime</div>
              <div className="text-2xl text-neon-cyan">{analysis.optimalOrbit?.estimatedLifetime?.estimatedLifetimeDays} days</div>
            </div>
          </div>
        </div>
      )}

      {options && (
        <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
          <h2 className="text-xl font-semibold text-white mb-4">Low-Risk Options</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-white/50 text-sm">
                  <th className="text-left py-2">Altitude</th>
                  <th className="text-left py-2">Risk Score</th>
                  <th className="text-left py-2">Lifetime</th>
                  <th className="text-left py-2">Recommended</th>
                </tr>
              </thead>
              <tbody>
                {options.results?.slice(0, 5).map((opt, i) => (
                  <tr key={i} className="border-t border-glass-border">
                    <td className="py-3 text-white">{opt.altitude} km</td>
                    <td className="py-3 text-white">{opt.collisionRiskScore}</td>
                    <td className="py-3 text-white">{opt.estimatedLifetime?.estimatedLifetimeDays} days</td>
                    <td className="py-3">{opt.recommended ? <span className="text-neon-cyan">✓</span> : <span className="text-white/30">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionPlanning;