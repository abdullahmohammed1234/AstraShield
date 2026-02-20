import { useState, useEffect } from 'react';
import { launchWindowApi } from '../services/api';

// Color utilities matching the dark theme
const getScoreColor = (score) => {
  if (score >= 80) return 'text-neon-cyan';
  if (score >= 60) return 'text-solar-amber';
  if (score >= 40) return 'text-orange-400';
  return 'text-alert-red';
};

const getScoreBgColor = (score) => {
  if (score >= 80) return 'bg-neon-cyan/20 border-neon-cyan/30';
  if (score >= 60) return 'bg-solar-amber/20 border-solar-amber/30';
  if (score >= 40) return 'bg-orange-500/20 border-orange-500/30';
  return 'bg-alert-red/20 border-alert-red/30';
};

const getSuitabilityColor = (rating) => {
  switch (rating) {
    case 'excellent': return 'text-neon-cyan';
    case 'good': return 'text-blue-400';
    case 'fair': return 'text-solar-amber';
    case 'poor': return 'text-alert-red';
    default: return 'text-white/50';
  }
};

const LaunchWindowAnalyzer = () => {
  const [targetAltitude, setTargetAltitude] = useState(400);
  const [targetInclination, setTargetInclination] = useState(0);
  const [launchDate, setLaunchDate] = useState(new Date().toISOString().slice(0, 16));
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await launchWindowApi.analyze({
        targetAltitude: parseFloat(targetAltitude),
        targetInclination: parseFloat(targetInclination),
        launchDate
      });
      setAnalysis(response.data);
    } catch (err) {
      console.error('Launch window analysis error:', err);
      setError(err.response?.data?.error || err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  // Auto-run analysis on mount
  useEffect(() => {
    runAnalysis();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    runAnalysis();
  };

  return (
    <div className="space-y-6">
      {/* Input Form - Dark Theme Card */}
      <form onSubmit={handleSubmit} className="glass-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-white/50 text-xs mb-1">Target Altitude (km)</label>
            <input
              type="number"
              value={targetAltitude}
              onChange={(e) => setTargetAltitude(e.target.value)}
              min={200}
              max={2000}
              step={10}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-neon-cyan"
            />
          </div>
          <div>
            <label className="block text-white/50 text-xs mb-1">Inclination (°)</label>
            <input
              type="number"
              value={targetInclination}
              onChange={(e) => setTargetInclination(e.target.value)}
              min={0}
              max={180}
              step={0.5}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-neon-cyan"
            />
          </div>
          <div>
            <label className="block text-white/50 text-xs mb-1">Launch Date/Time (UTC)</label>
            <input
              type="datetime-local"
              value={launchDate}
              onChange={(e) => setLaunchDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-neon-cyan"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="neon-button w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="bg-alert-red/20 border border-alert-red/50 rounded-lg p-3 text-alert-red text-sm">
          {error}
        </div>
      )}

      {analysis?.success && (
        <>
          {/* Tab Navigation - Dark Theme */}
          <div className="flex gap-2 border-b border-white/10">
            {['overview', 'altitudes', 'inclination', 'windows'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t transition-all ${
                  activeTab === tab
                    ? 'bg-white/10 text-neon-cyan border-b-2 border-neon-cyan'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Launch Opportunity Score - Dark Theme Card */}
              <div className="glass-card p-6 border border-neon-cyan/20">
                <h4 className="font-orbitron text-sm font-semibold text-white/70 mb-4">
                  LAUNCH OPPORTUNITY SCORE
                </h4>
                <div className="flex items-center gap-6">
                  <div className={`text-6xl font-orbitron font-bold ${getScoreColor(analysis.launchOpportunityScore.overallScore)}`}>
                    {analysis.launchOpportunityScore.overallScore}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div className={`p-3 rounded-lg border ${getScoreBgColor(analysis.launchOpportunityScore.scores.debrisRisk)}`}>
                      <div className="text-white/40 text-xs">Debris Risk</div>
                      <div className={`text-2xl font-orbitron font-semibold ${getScoreColor(analysis.launchOpportunityScore.scores.debrisRisk)}`}>
                        {analysis.launchOpportunityScore.scores.debrisRisk}
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg border ${getScoreBgColor(analysis.launchOpportunityScore.scores.orbitalMechanics)}`}>
                      <div className="text-white/40 text-xs">Orbital Mechanics</div>
                      <div className={`text-2xl font-orbitron font-semibold ${getScoreColor(analysis.launchOpportunityScore.scores.orbitalMechanics)}`}>
                        {analysis.launchOpportunityScore.scores.orbitalMechanics}
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg border ${getScoreBgColor(analysis.launchOpportunityScore.scores.conjunctionRisk)}`}>
                      <div className="text-white/40 text-xs">Conjunction Risk</div>
                      <div className={`text-2xl font-orbitron font-semibold ${getScoreColor(analysis.launchOpportunityScore.scores.conjunctionRisk)}`}>
                        {analysis.launchOpportunityScore.scores.conjunctionRisk}
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg border ${getScoreBgColor(analysis.launchOpportunityScore.scores.weatherWindow)}`}>
                      <div className="text-white/40 text-xs">Weather Window</div>
                      <div className={`text-2xl font-orbitron font-semibold ${getScoreColor(analysis.launchOpportunityScore.scores.weatherWindow)}`}>
                        {analysis.launchOpportunityScore.scores.weatherWindow}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Rating Badge - Dark Theme */}
                <div className="mt-4 flex items-center gap-2">
                  <span className={`px-3 py-1 rounded font-orbitron text-xs font-semibold uppercase ${
                    analysis.launchOpportunityScore.rating === 'excellent' ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30' :
                    analysis.launchOpportunityScore.rating === 'good' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    analysis.launchOpportunityScore.rating === 'fair' ? 'bg-solar-amber/20 text-solar-amber border border-solar-amber/30' :
                    'bg-alert-red/20 text-alert-red border border-alert-red/30'
                  }`}>
                    {analysis.launchOpportunityScore.rating}
                  </span>
                  <span className="text-white/50 text-xs">Rating</span>
                </div>
              </div>

              {/* Recommendations - Dark Theme */}
              {analysis.launchOpportunityScore.recommendations?.length > 0 && (
                <div className="glass-card p-4">
                  <h4 className="font-orbitron text-sm font-semibold text-white/70 mb-3">
                    RECOMMENDATIONS
                  </h4>
                  <div className="space-y-2">
                    {analysis.launchOpportunityScore.recommendations.map((rec, idx) => (
                      <div key={idx} className={`p-3 rounded-lg border-l-2 ${
                        rec.priority === 'high' ? 'bg-alert-red/10 border-alert-red' :
                        rec.priority === 'medium' ? 'bg-solar-amber/10 border-solar-amber' :
                        'bg-white/5 border-white/30'
                      }`}>
                        <span className="text-xs text-white/50 uppercase mr-2 font-medium">{rec.priority}</span>
                        <span className="text-white text-sm">{rec.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Parameters Summary - Dark Theme */}
              <div className="glass-card p-4">
                <h4 className="font-orbitron text-sm font-semibold text-white/70 mb-2">
                  ANALYSIS PARAMETERS
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-white/50">Target Altitude:</span>
                    <span className="text-white ml-2 font-mono">{analysis.inputParameters.targetAltitude} km</span>
                  </div>
                  <div>
                    <span className="text-white/50">Inclination:</span>
                    <span className="text-white ml-2 font-mono">{analysis.inputParameters.targetInclination}°</span>
                  </div>
                  <div>
                    <span className="text-white/50">Launch Date:</span>
                    <span className="text-white ml-2 font-mono">{new Date(analysis.inputParameters.launchDate).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Optimal Altitudes Tab - Dark Theme */}
          {activeTab === 'altitudes' && (
            <div className="space-y-3">
              <h4 className="font-orbitron text-sm font-semibold text-white/70 mb-3">
                OPTIMAL INSERTION ALTITUDE RECOMMENDATIONS
              </h4>
              {analysis.optimalInsertionAltitudes?.map((alt, idx) => (
                <div key={idx} className="glass-card p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded font-orbitron text-xs font-semibold border ${getSuitabilityColor(alt.suitabilityRating)} bg-white/5`}>
                        {alt.suitabilityRating}
                      </span>
                      <span className="text-white font-medium">{alt.altitudeBand}</span>
                    </div>
                    <span className={`text-2xl font-orbitron font-bold ${getScoreColor(alt.suitability)}`}>
                      {alt.suitability}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-white/50">
                    <div>
                      <span className="text-white/30">Range:</span>
                      <span className="text-white ml-1 font-mono">{alt.minAltitude}-{alt.maxAltitude} km</span>
                    </div>
                    <div>
                      <span className="text-white/30">Orbital Period:</span>
                      <span className="text-white ml-1 font-mono">{alt.orbitalPeriodMinutes} min</span>
                    </div>
                    <div>
                      <span className="text-white/30">Debris Risk:</span>
                      <span className={`ml-1 font-mono ${getScoreColor(100 - alt.debrisRiskScore)}`}>{alt.debrisRiskScore}/100</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inclination Analysis Tab - Dark Theme */}
          {activeTab === 'inclination' && analysis.inclinationDebrisAnalysis && (
            <div className="space-y-4">
              <h4 className="font-orbitron text-sm font-semibold text-white/70 mb-3">
                INCLINATION VS. DEBRIS DENSITY ANALYSIS
              </h4>
              
              <div className="glass-card p-6 border border-white/10">
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <div className="text-white/40 text-xs">Target Inclination</div>
                    <div className="text-4xl font-orbitron font-bold text-white">{analysis.inclinationDebrisAnalysis.targetInclination}°</div>
                  </div>
                  <div>
                    <div className="text-white/40 text-xs">Collision Risk Score</div>
                    <div className={`text-4xl font-orbitron font-bold ${getScoreColor(100 - analysis.inclinationDebrisAnalysis.collisionRiskScore)}`}>
                      {analysis.inclinationDebrisAnalysis.collisionRiskScore}/100
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <div className="text-white/40 text-xs">Objects at Inclination</div>
                    <div className="text-2xl font-orbitron text-white">{analysis.inclinationDebrisAnalysis.totalObjectsAtInclination}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <div className="text-white/40 text-xs">Debris Objects</div>
                    <div className="text-2xl font-orbitron text-white">{analysis.inclinationDebrisAnalysis.debrisObjectsAtInclination}</div>
                  </div>
                </div>

                <div className={`inline-block px-4 py-2 rounded-lg font-orbitron text-sm font-medium ${
                  analysis.inclinationDebrisAnalysis.riskLevel === 'low' ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30' :
                  analysis.inclinationDebrisAnalysis.riskLevel === 'moderate' ? 'bg-solar-amber/20 text-solar-amber border border-solar-amber/30' :
                  'bg-alert-red/20 text-alert-red border border-alert-red/30'
                }`}>
                  {analysis.inclinationDebrisAnalysis.riskLevel.toUpperCase()} RISK LEVEL
                </div>
                
                <p className="text-white/60 text-sm mt-4">{analysis.inclinationDebrisAnalysis.recommendation}</p>
              </div>

              {/* Better Inclination Options - Dark Theme */}
              {analysis.inclinationDebrisAnalysis.betterInclinationOptions?.length > 0 && (
                <div className="glass-card p-4">
                  <h5 className="font-orbitron text-sm font-semibold text-white/70 mb-3">
                    ALTERNATIVE INCLINATION OPTIONS
                  </h5>
                  <div className="space-y-2">
                    {analysis.inclinationDebrisAnalysis.betterInclinationOptions.map((band, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white/5 rounded-lg p-3 border border-white/10">
                        <div>
                          <span className="text-white font-medium">{band.name}</span>
                          <span className="text-xs text-white/40 ml-2">({band.min}°-{band.max}°)</span>
                        </div>
                        <span className="text-xs text-white/40">{band.primaryUse}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Available Bands Info - Dark Theme */}
          {activeTab === 'windows' && (
            <div className="space-y-4">
              <h4 className="font-orbitron text-sm font-semibold text-white/70 mb-3">
                AVAILABLE ORBITAL PARAMETERS
              </h4>
              
              <div className="glass-card p-4">
                <h5 className="text-white/40 text-xs uppercase mb-2 font-orbitron">Altitude Bands</h5>
                <div className="grid grid-cols-2 gap-2">
                  {analysis.availableAltitudeBands?.map((band, idx) => (
                    <div key={idx} className="bg-white/5 rounded p-2 border border-white/10 text-xs">
                      <span className="text-white font-medium">{band.name}</span>
                      <span className="text-white/40 ml-2">({band.min}-{band.max} km)</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-4">
                <h5 className="text-white/40 text-xs uppercase mb-2 font-orbitron">Inclination Bands</h5>
                <div className="grid grid-cols-2 gap-2">
                  {analysis.availableInclinationBands?.map((band, idx) => (
                    <div key={idx} className="bg-white/5 rounded p-2 border border-white/10 text-xs">
                      <span className="text-white font-medium">{band.name}</span>
                      <span className="text-white/40 ml-2">({band.min}°-{band.max}°)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!analysis?.success && !loading && !error && (
        <div className="glass-card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-neon-cyan/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <p className="text-white/60">
            Configure parameters and click Analyze to get launch window recommendations
          </p>
        </div>
      )}
    </div>
  );
};

export default LaunchWindowAnalyzer;
