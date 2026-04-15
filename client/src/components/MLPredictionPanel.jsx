import { useState, useEffect } from 'react';
import { mlPredictionApi } from '../services/api';

const MLPredictionPanel = () => {
  const [predictions, setPredictions] = useState(null);
  const [highRiskPeriods, setHighRiskPeriods] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [predictionsRes, periodsRes, statusRes] = await Promise.all([
        mlPredictionApi.getPredictions(),
        mlPredictionApi.getHighRiskPeriods(7),
        mlPredictionApi.getModelStatus()
      ]);

      if (predictionsRes.data.success) {
        setPredictions(predictionsRes.data);
      }
      if (periodsRes.data.success) {
        setHighRiskPeriods(periodsRes.data);
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

  if (loading) {
    return (
      <div className="p-4 bg-slate-800 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-3">ML Risk Predictions</h3>
        <div className="text-gray-400">Loading predictions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-slate-800 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-3">ML Risk Predictions</h3>
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Risk Predictions */}
      <div className="p-4 bg-slate-800 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-3">ML Risk Predictions (24-72h)</h3>
        
        {predictions?.horizons ? (
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(predictions.horizons).map(([horizon, data]) => (
              <div 
                key={horizon}
                className={`p-3 rounded-lg border ${getRiskBg(data.riskLevelLabel)}`}
              >
                <div className="text-sm text-gray-400 mb-1">{horizon} ahead</div>
                <div className={`text-xl font-bold ${getRiskColor(data.riskLevelLabel)}`}>
                  {data.riskLevelLabel?.toUpperCase()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Confidence: {(data.confidence * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-400">No prediction data available</div>
        )}

        <div className="mt-3 text-xs text-gray-500">
          Generated: {predictions?.generatedAt ? new Date(predictions.generatedAt).toLocaleString() : 'N/A'}
        </div>
      </div>

      {/* High Risk Periods */}
      <div className="p-4 bg-slate-800 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-3">High Risk Periods (7 days)</h3>
        
        {highRiskPeriods?.highRiskPeriods?.length > 0 ? (
          <div className="space-y-2">
            {highRiskPeriods.highRiskPeriods.map((period, idx) => (
              <div 
                key={idx}
                className="flex items-center justify-between p-2 bg-red-500/10 rounded border border-red-500/20"
              >
                <div>
                  <span className="text-orange-400 font-medium">{period.horizon}</span>
                  <span className="text-gray-400 ml-2">
                    {new Date(period.startTime).toLocaleDateString()}
                  </span>
                </div>
                <span className={`text-sm ${getRiskColor(period.riskLevel)}`}>
                  {period.riskLevel}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-green-400">No high-risk periods predicted</div>
        )}
      </div>

      {/* Model Status */}
      <div className="p-4 bg-slate-800 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-3">Model Status</h3>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Initialized:</span>
            <span className={modelStatus?.isInitialized ? 'text-green-400' : 'text-red-400'}>
              {modelStatus?.isInitialized ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Risk Model:</span>
            <span className="text-blue-400">{modelStatus?.riskModel?.modelType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Anomaly Model:</span>
            <span className="text-blue-400">{modelStatus?.anomalyModel?.modelType}</span>
          </div>
          {modelStatus?.lastTraining && (
            <div className="flex justify-between">
              <span className="text-gray-400">Last Training:</span>
              <span className="text-gray-300">
                {new Date(modelStatus.lastTraining).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Refresh Button */}
      <button
        onClick={fetchData}
        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        Refresh Predictions
      </button>
    </div>
  );
};

export default MLPredictionPanel;
