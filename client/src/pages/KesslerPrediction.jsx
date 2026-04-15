import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend, BarChart, Bar
} from 'recharts';
import { kesslerApi } from '../services/api';

const KesslerPrediction = () => {
  const [projections, setProjections] = useState([]);
  const [selectedProjection, setSelectedProjection] = useState(null);
  const [riskAnalysis, setRiskAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projecting, setProjecting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  const toast = { error: (msg) => console.error(msg), success: (msg) => console.log(msg) };
  
  const [params, setParams] = useState({
    name: '',
    horizon: 10,
    assumptions: {
      annualLaunchRate: 100,
      breakupRate: 0.001,
      avgFragmentsPerBreakup: 200,
      solarActivity: 'medium',
      activeDebrisRemoval: false,
      removalRate: 0,
      cascadeThreshold: 0.1
    }
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [projRes, riskRes] = await Promise.all([
        kesslerApi.getProjections({}),
        kesslerApi.getRiskAnalysis()
      ]);
      setProjections(projRes.data.data || []);
      setRiskAnalysis(riskRes.data.data);
    } catch (err) {
      console.error('Error fetching kessler data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleProject = async () => {
    try {
      setProjecting(true);
      const res = await kesslerApi.project(params);
      toast.success('Kessler projection completed successfully');
      setShowForm(false);
      setParams({
        name: '',
        horizon: 10,
        assumptions: {
          annualLaunchRate: 100,
          breakupRate: 0.001,
          avgFragmentsPerBreakup: 200,
          solarActivity: 'medium',
          activeDebrisRemoval: false,
          removalRate: 0,
          cascadeThreshold: 0.1
        }
      });
      fetchData();
      if (res.data.data) {
        setSelectedProjection(res.data.data);
      }
    } catch (err) {
      toast.error('Projection failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setProjecting(false);
    }
  };

  const handleSelectProjection = (proj) => {
    setSelectedProjection(proj);
  };

  const riskColors = {
    low: '#22C55E',
    medium: '#F59E0B',
    high: '#EF4444',
    critical: '#DC2626',
    extreme: '#7C2D12'
  };

  const trendColors = {
    stable: '#9CA3AF',
    increasing: '#F59E0B',
    decreasing: '#22C55E',
    critical: '#EF4444'
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num || 0);
  };

  const getProjectionChartData = (shell) => {
    if (!selectedProjection?.projections) return [];
    return selectedProjection.projections
      .filter(p => p.orbitalShell === shell)
      .map(p => ({
        year: p.year,
        objects: p.totalObjectCount,
        debris: p.debrisCount,
        cascadeProb: p.cascadeProbability * 100,
        collisionRate: p.collisionRate * 1000
      }));
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Kessler Syndrome Prediction</h1>
          <p className="text-gray-400 mt-1">Project cascade collision risks over 10-50 year horizons</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-colors"
        >
          {showForm ? 'Cancel' : 'New Projection'}
        </button>
      </div>

      {riskAnalysis && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`p-4 rounded-xl border ${
            riskAnalysis.riskLevel === 'critical' || riskAnalysis.riskLevel === 'extreme'
              ? 'border-red-500 bg-red-500/10'
              : riskAnalysis.riskLevel === 'high'
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-gray-700 bg-gray-800/50'
          }`}>
            <div className="text-sm text-gray-400">Overall Risk Level</div>
            <div className="text-2xl font-bold mt-1" style={{ color: riskColors[riskAnalysis.riskLevel || 'low'] }}>
              {riskAnalysis.riskLevel?.toUpperCase() || 'LOW'}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-gray-700 bg-gray-800/50">
            <div className="text-sm text-gray-400">Trend</div>
            <div className="text-2xl font-bold mt-1" style={{ color: trendColors[riskAnalysis.trend || 'stable'] }}>
              {riskAnalysis.trend?.toUpperCase() || 'STABLE'}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-gray-700 bg-gray-800/50">
            <div className="text-sm text-gray-400">Cascade Triggered</div>
            <div className={`text-2xl font-bold mt-1 ${
              riskAnalysis.cascadeTriggered ? 'text-red-500' : 'text-green-500'
            }`}>
              {riskAnalysis.cascadeTriggered ? 'YES' : 'NO'}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-gray-700 bg-gray-800/50">
            <div className="text-sm text-gray-400">Trigger Year</div>
            <div className="text-2xl font-bold mt-1 text-white">
              {riskAnalysis.triggerYear || 'N/A'}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Projection Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Projection Name</label>
              <input
                type="text"
                value={params.name}
                onChange={(e) => setParams({ ...params, name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                placeholder="e.g., Business as Usual"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Projection Horizon (years)</label>
              <input
                type="number"
                value={params.horizon}
                onChange={(e) => setParams({ ...params, horizon: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                min={10}
                max={50}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Annual Launch Rate</label>
              <input
                type="number"
                value={params.assumptions.annualLaunchRate}
                onChange={(e) => setParams({
                  ...params,
                  assumptions: { ...params.assumptions, annualLaunchRate: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Breakup Rate</label>
              <input
                type="number"
                step="0.0001"
                value={params.assumptions.breakupRate}
                onChange={(e) => setParams({
                  ...params,
                  assumptions: { ...params.assumptions, breakupRate: parseFloat(e.target.value) }
                })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Solar Activity</label>
              <select
                value={params.assumptions.solarActivity}
                onChange={(e) => setParams({
                  ...params,
                  assumptions: { ...params.assumptions, solarActivity: e.target.value }
                })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Avg Fragments per Breakup</label>
              <input
                type="number"
                value={params.assumptions.avgFragmentsPerBreakup}
                onChange={(e) => setParams({
                  ...params,
                  assumptions: { ...params.assumptions, avgFragmentsPerBreakup: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="activeRemoval"
                checked={params.assumptions.activeDebrisRemoval}
                onChange={(e) => setParams({
                  ...params,
                  assumptions: { ...params.assumptions, activeDebrisRemoval: e.target.checked }
                })}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600"
              />
              <label htmlFor="activeRemoval" className="text-sm text-gray-400">Enable Active Debris Removal</label>
            </div>
            {params.assumptions.activeDebrisRemoval && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Removal Rate (% per year)</label>
                <input
                  type="number"
                  step="0.001"
                  value={params.assumptions.removalRate}
                  onChange={(e) => setParams({
                    ...params,
                    assumptions: { ...params.assumptions, removalRate: parseFloat(e.target.value) }
                  })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleProject}
              disabled={projecting}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {projecting ? 'Projecting...' : 'Run Projection'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-semibold text-white">Saved Projections</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {projections.map((proj) => (
              <div
                key={proj.projectionId}
                onClick={() => handleSelectProjection(proj)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedProjection?.projectionId === proj.projectionId
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{proj.name}</span>
                  <span
                    className="px-2 py-0.5 text-xs rounded-full"
                    style={{ backgroundColor: `${riskColors[proj.riskAssessment?.criticalityLevel || 'low']}30`, color: riskColors[proj.riskAssessment?.criticalityLevel || 'low'] }}
                  >
                    {proj.riskAssessment?.criticalityLevel || 'low'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  <div className="flex justify-between">
                    <span>Horizon: {proj.projectionHorizon} years</span>
                    <span>{new Date(proj.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Risk Score: {(proj.riskAssessment?.overallRiskScore || 0).toFixed(2)}</span>
                    <span className={proj.cascadeTrigger?.triggered ? 'text-red-400' : 'text-green-400'}>
                      {proj.cascadeTrigger?.triggered ? `Trigger: ${proj.cascadeTrigger.triggerYear}` : 'No cascade'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {projections.length === 0 && !loading && (
              <div className="text-center text-gray-500 py-8">No projections saved</div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selectedProjection ? (
            <>
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{selectedProjection.name}</h3>
                  <span
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{ 
                      backgroundColor: `${riskColors[selectedProjection.riskAssessment?.criticalityLevel || 'low']}30`, 
                      color: riskColors[selectedProjection.riskAssessment?.criticalityLevel || 'low'] 
                    }}
                  >
                    {selectedProjection.riskAssessment?.criticalityLevel?.toUpperCase() || 'LOW'} RISK
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <div className="text-sm text-gray-400">Projection Horizon</div>
                    <div className="text-white font-bold">{selectedProjection.projectionHorizon} years</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Overall Risk Score</div>
                    <div className="text-white font-bold">{(selectedProjection.riskAssessment?.overallRiskScore || 0).toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Confidence</div>
                    <div className="text-white font-bold">{(selectedProjection.riskAssessment?.confidence || 0).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Trend</div>
                    <div className="font-bold" style={{ color: trendColors[selectedProjection.riskAssessment?.trend || 'stable'] }}>
                      {selectedProjection.riskAssessment?.trend?.toUpperCase() || 'STABLE'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Object Count Projections</h3>
                <div className="flex gap-2 mb-4">
                  {['LEO', 'MEO', 'GEO'].map(shell => (
                    <button
                      key={shell}
                      className={`px-3 py-1 rounded text-sm ${
                        'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {shell}
                    </button>
                  ))}
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getProjectionChartData('LEO')}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="year" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" tickFormatter={(v) => formatNumber(v)} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        labelStyle={{ color: '#F9FAFB' }}
                        formatter={(value) => formatNumber(value)}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="objects" stroke="#22D3EE" name="Total Objects" dot={false} />
                      <Line type="monotone" dataKey="debris" stroke="#EF4444" name="Debris" dot={false} strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Cascade Probability</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={getProjectionChartData('LEO')}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="year" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" tickFormatter={(v) => `${v.toFixed(1)}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        labelStyle={{ color: '#F9FAFB' }}
                        formatter={(value) => `${value.toFixed(2)}%`}
                      />
                      <Area
                        type="monotone"
                        dataKey="cascadeProb"
                        stroke="#EF4444"
                        fill="#EF444430"
                        name="Cascade Probability"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Assumptions</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Annual Launch Rate:</span>
                    <span className="text-white ml-2">{selectedProjection.assumptions?.annualLaunchRate}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Breakup Rate:</span>
                    <span className="text-white ml-2">{selectedProjection.assumptions?.breakupRate}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Fragments/Breakup:</span>
                    <span className="text-white ml-2">{selectedProjection.assumptions?.avgFragmentsPerBreakup}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Solar Activity:</span>
                    <span className="text-white ml-2">{selectedProjection.assumptions?.solarActivity}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Active Debris Removal:</span>
                    <span className="text-white ml-2">{selectedProjection.assumptions?.activeDebrisRemoval ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Cascade Threshold:</span>
                    <span className="text-white ml-2">{(selectedProjection.assumptions?.cascadeThreshold || 0.1) * 100}%</span>
                  </div>
                </div>
              </div>

              {selectedProjection.cascadeTrigger && (
                <div className={`rounded-xl border p-4 ${
                  selectedProjection.cascadeTrigger.triggered
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-gray-700 bg-gray-800/50'
                }`}>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {selectedProjection.cascadeTrigger.triggered ? 'Cascade Detected!' : 'No Cascade Detected'}
                  </h3>
                  <p className="text-gray-300">
                    {selectedProjection.cascadeTrigger.description}
                  </p>
                  {selectedProjection.cascadeTrigger.triggered && (
                    <div className="mt-2 text-sm text-gray-400">
                      Trigger Year: {selectedProjection.cascadeTrigger.triggerYear} | Probability: {(selectedProjection.cascadeTrigger.triggerProbability * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-96 bg-gray-800/30 rounded-xl border border-gray-700">
              <div className="text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p>Select a projection or create a new one</p>
              </div>
            </div>
          )}
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

export default KesslerPrediction;