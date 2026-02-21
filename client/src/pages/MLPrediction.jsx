import { useState, useEffect } from 'react';
import { mlPredictionApi } from '../services/api';

const MLPrediction = () => {
  const [predictions, setPredictions] = useState(null);
  const [highRiskPeriods, setHighRiskPeriods] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('predictions');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [predictionsRes, periodsRes, anomaliesRes, statusRes] = await Promise.all([
        mlPredictionApi.getPredictions(),
        mlPredictionApi.getHighRiskPeriods(7),
        mlPredictionApi.detectAllAnomalies(50),
        mlPredictionApi.getModelStatus()
      ]);

      if (predictionsRes.data.success) {
        setPredictions(predictionsRes.data);
      }
      if (periodsRes.data.success) {
        setHighRiskPeriods(periodsRes.data);
      }
      if (anomaliesRes.data.success) {
        setAnomalies(anomaliesRes.data);
      }
      if (statusRes.data.success) {
        setModelStatus(statusRes.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'low': return 'text-green-400';
      case 'medium': return 'text-yellow-400';
      case 'high': return 'text-orange-500';
      case 'critical': return 'text-red-500';
      default: return 'text-gray-400';
    }
  };

  const getRiskBg = (level) => {
    switch (level) {
      case 'low': return 'bg-green-500/20 border-green-500/30';
      case 'medium': return 'bg-yellow-500/20 border-yellow-500/30';
      case 'high': return 'bg-orange-500/20 border-orange-500/30';
      case 'critical': return 'bg-red-500/20 border-red-500/30';
      default: return 'bg-gray-500/20 border-gray-500/30';
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-red-400';
      case 'high': return 'text-orange-400';
      case 'medium': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card p-8 text-center">
            <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-white/70">Loading ML predictions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card p-8 text-center">
            <p className="text-alert-red mb-4">Error: {error}</p>
            <button onClick={fetchData} className="neon-button">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-orbitron text-white mb-2">ML Risk Prediction</h1>
          <p className="text-white/60">Machine learning powered risk forecasting and anomaly detection</p>
        </div>

        {/* Model Status */}
        <div className="glass-card p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-white/60 text-sm">Model Status:</span>
                <span className={modelStatus?.isInitialized ? 'text-green-400 ml-2' : 'text-red-400 ml-2'}>
                  {modelStatus?.isInitialized ? 'Initialized' : 'Not Initialized'}
                </span>
              </div>
              <div>
                <span className="text-white/60 text-sm">Risk Model:</span>
                <span className="text-blue-400 ml-2">{modelStatus?.riskModel?.modelType}</span>
              </div>
              <div>
                <span className="text-white/60 text-sm">Anomaly Model:</span>
                <span className="text-blue-400 ml-2">{modelStatus?.anomalyModel?.modelType}</span>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('predictions')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'predictions' ? 'bg-neon-cyan text-black' : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            Risk Predictions
          </button>
          <button
            onClick={() => setActiveTab('anomalies')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'anomalies' ? 'bg-neon-cyan text-black' : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            Anomaly Detection
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'history' ? 'bg-neon-cyan text-black' : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            History
          </button>
        </div>

        {/* Predictions Tab */}
        {activeTab === 'predictions' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Forecast */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Risk Forecast (24-72h)</h3>
              {predictions?.horizons ? (
                <div className="grid grid-cols-3 gap-4">
                  {Object.entries(predictions.horizons).map(([horizon, data]) => (
                    <div 
                      key={horizon}
                      className={`p-4 rounded-lg border ${getRiskBg(data.riskLevelLabel)} text-center`}
                    >
                      <div className="text-sm text-gray-400 mb-2">{horizon} ahead</div>
                      <div className={`text-2xl font-bold ${getRiskColor(data.riskLevelLabel)}`}>
                        {data.riskLevelLabel?.toUpperCase()}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Confidence: {(data.confidence * 100).toFixed(0)}%
                      </div>
                      {/* Probability distribution */}
                      <div className="mt-3 text-xs">
                        <div className="flex justify-between text-gray-500 mb-1">
                          <span>Low</span><span>Med</span><span>High</span><span>Crit</span>
                        </div>
                        <div className="flex h-2 rounded overflow-hidden">
                          <div className="bg-green-500" style={{ width: `${(data.probabilities?.[0] || 0) * 100}%` }}></div>
                          <div className="bg-yellow-500" style={{ width: `${(data.probabilities?.[1] || 0) * 100}%` }}></div>
                          <div className="bg-orange-500" style={{ width: `${(data.probabilities?.[2] || 0) * 100}%` }}></div>
                          <div className="bg-red-500" style={{ width: `${(data.probabilities?.[3] || 0) * 100}%` }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400">No prediction data available</div>
              )}
              <div className="mt-4 text-xs text-gray-500">
                Generated: {predictions?.generatedAt ? new Date(predictions.generatedAt).toLocaleString() : 'N/A'}
              </div>
            </div>

            {/* High Risk Periods */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-semibold text-white mb-4">High Risk Periods (7 days)</h3>
              {highRiskPeriods?.highRiskPeriods?.length > 0 ? (
                <div className="space-y-3">
                  {highRiskPeriods.highRiskPeriods.map((period, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/20"
                    >
                      <div>
                        <span className="text-orange-400 font-medium">{period.horizon}</span>
                        <span className="text-gray-400 ml-3">
                          {new Date(period.startTime).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-medium ${getRiskColor(period.riskLevel)}`}>
                          {period.riskLevel}
                        </span>
                        <div className="text-xs text-gray-500">
                          {(period.probability * 100).toFixed(0)}% probability
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-green-400 p-4 bg-green-500/10 rounded-lg">
                  ✓ No high-risk periods predicted for the next 7 days
                </div>
              )}
            </div>
          </div>
        )}

        {/* Anomalies Tab */}
        {activeTab === 'anomalies' && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-semibold text-white mb-4">
              Satellite Anomalies ({anomalies?.anomalyCount || 0} detected)
            </h3>
            
            {anomalies?.anomalies?.length > 0 ? (
              <div className="space-y-3">
                {anomalies.anomalies.map((sat, idx) => (
                  <div 
                    key={idx}
                    className="p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-white font-medium">{sat.name}</span>
                        <span className="text-gray-400 ml-2">#{sat.noradCatId}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">
                          Score: {(sat.anomalyScore * 100).toFixed(0)}%
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(sat.severity)} bg-slate-700`}>
                          {sat.severity}
                        </span>
                      </div>
                    </div>
                    
                    {sat.anomalies?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {sat.anomalies.map((anomaly, aIdx) => (
                          <div key={aIdx} className="text-sm text-gray-400 flex items-start gap-2">
                            <span className="text-red-400">•</span>
                            <span>{anomaly.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-green-400 p-4 bg-green-500/10 rounded-lg">
                ✓ No anomalies detected
              </div>
            )}

            <div className="mt-4 text-xs text-gray-500">
              Analyzed {anomalies?.totalAnalyzed || 0} satellites
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="glass-card p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Prediction History</h3>
            <div className="text-gray-400">
              Prediction history will be displayed here. Historical data is stored in the database
              and can be used for model accuracy analysis.
            </div>
            <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Critical anomalies:</span>
                  <span className="text-red-400 ml-2">{anomalies?.criticalCount || 0}</span>
                </div>
                <div>
                  <span className="text-gray-400">High severity:</span>
                  <span className="text-orange-400 ml-2">{anomalies?.highCount || 0}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MLPrediction;
