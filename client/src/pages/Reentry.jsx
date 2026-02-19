import { useState, useEffect, useCallback } from 'react';
import { reentryApi } from '../services/api';
import { useAlertWebSocket } from '../hooks/useAlertWebSocket';
import { colors } from '../theme/colors';

const Reentry = () => {
  const [predictions, setPredictions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedPrediction, setSelectedPrediction] = useState(null);
  const [view, setView] = useState('predictions'); // 'predictions' | 'alerts'

  const { isConnected, alerts: wsAlerts } = useAlertWebSocket();

  const fetchPredictions = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filter !== 'all') {
        params.status = filter;
      }
      const response = await reentryApi.getAll(params);
      setPredictions(response.data.data || response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await reentryApi.getAlerts();
      setAlerts(response.data.data || response.data);
    } catch (err) {
      console.error('Failed to fetch reentry alerts:', err);
    }
  }, []);

  const fetchStatistics = useCallback(async () => {
    try {
      const response = await reentryApi.getStatistics();
      setStatistics(response.data.data || response.data);
    } catch (err) {
      console.error('Failed to fetch statistics:', err);
    }
  }, []);

  useEffect(() => {
    fetchPredictions();
    fetchAlerts();
    fetchStatistics();
  }, [fetchPredictions, fetchAlerts, fetchStatistics]);

  // Merge WebSocket alerts with fetched alerts
  useEffect(() => {
    if (wsAlerts.length > 0) {
      const reentryAlerts = wsAlerts.filter(a => a.type === 'reentry');
      if (reentryAlerts.length > 0) {
        setAlerts((prev) => {
          const merged = [...prev];
          reentryAlerts.forEach((wsAlert) => {
            const index = merged.findIndex((a) => a.alertId === wsAlert.alertId);
            if (index >= 0) {
              merged[index] = wsAlert;
            } else {
              merged.unshift(wsAlert);
            }
          });
          return merged;
        });
      }
    }
  }, [wsAlerts]);

  const getStatusColor = (status) => {
    const colorMap = {
      critical: colors.danger,
      warning: colors.warning,
      elevated: '#f59e0b',
      normal: colors.success
    };
    return colorMap[status] || colors.textSecondary;
  };

  const getPriorityColor = (priority) => {
    const colorMap = {
      critical: colors.danger,
      high: colors.warning,
      medium: '#f59e0b',
      low: colors.success
    };
    return colorMap[priority] || colors.textSecondary;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  const formatDaysUntil = (days) => {
    if (days === undefined || days === null) return 'N/A';
    if (days < 1) return `< 1 day`;
    return `${days} days`;
  };

  const filteredPredictions = filter === 'all'
    ? predictions
    : predictions.filter((p) => p.status === filter);

  const criticalCount = predictions.filter(p => p.status === 'critical').length;
  const warningCount = predictions.filter(p => p.status === 'warning').length;
  const uncontrolledCount = predictions.filter(p => p.uncontrolledAssessment?.isUncontrolled).length;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Re-Entry Prediction</h1>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-space-card rounded-lg p-4 border border-space-border">
            <div className="text-2xl font-bold text-white">{statistics.totalTracked || 0}</div>
            <div className="text-sm text-gray-400">Tracked Objects</div>
          </div>
          <div className="bg-space-card rounded-lg p-4 border border-space-border">
            <div className="text-2xl font-bold text-red-400">{statistics.byStatus?.critical || 0}</div>
            <div className="text-sm text-gray-400">Critical</div>
          </div>
          <div className="bg-space-card rounded-lg p-4 border border-space-border">
            <div className="text-2xl font-bold text-yellow-400">{statistics.byStatus?.warning || 0}</div>
            <div className="text-sm text-gray-400">Warning</div>
          </div>
          <div className="bg-space-card rounded-lg p-4 border border-space-border">
            <div className="text-2xl font-bold text-orange-400">{statistics.uncontrolledReentries || 0}</div>
            <div className="text-sm text-gray-400">Uncontrolled</div>
          </div>
          <div className="bg-space-card rounded-lg p-4 border border-space-border">
            <div className="text-2xl font-bold text-blue-400">{statistics.imminentReentries || 0}</div>
            <div className="text-sm text-gray-400">Imminent (&lt;7 days)</div>
          </div>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setView('predictions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'predictions'
              ? 'bg-blue-600 text-white'
              : 'bg-space-card text-gray-400 hover:bg-space-border'
          }`}
        >
          Predictions ({predictions.length})
        </button>
        <button
          onClick={() => setView('alerts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'alerts'
              ? 'bg-blue-600 text-white'
              : 'bg-space-card text-gray-400 hover:bg-space-border'
          }`}
        >
          Active Alerts ({alerts.length})
        </button>
      </div>

      {/* Filters for Predictions */}
      {view === 'predictions' && (
        <div className="flex gap-2 mb-6">
          {['all', 'critical', 'warning', 'elevated', 'normal'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-space-card text-gray-400 hover:bg-space-border'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-4 text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Predictions View */}
      {!loading && view === 'predictions' && filteredPredictions.length === 0 && (
        <div className="bg-space-card rounded-lg p-8 text-center text-gray-400">
          No reentry predictions found
        </div>
      )}

      {!loading && view === 'predictions' && filteredPredictions.length > 0 && (
        <div className="space-y-4">
          {filteredPredictions.map((prediction) => (
            <div
              key={prediction.noradCatId}
              className="bg-space-card rounded-lg p-4 border border-space-border hover:border-blue-500/50 transition-colors cursor-pointer"
              onClick={() => setSelectedPrediction(prediction)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ backgroundColor: getStatusColor(prediction.status) + '20', color: getStatusColor(prediction.status) }}
                    >
                      {prediction.status?.toUpperCase() || 'UNKNOWN'}
                    </span>
                    {prediction.uncontrolledAssessment?.isUncontrolled && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400">
                        UNCONTROLLED
                      </span>
                    )}
                    <span className="text-gray-400 text-sm">NORAD: {prediction.noradCatId}</span>
                  </div>
                  <div className="text-white font-medium mb-1">{prediction.name}</div>
                  <div className="text-sm text-gray-400">
                    Altitude: {prediction.currentAltitude?.toFixed(1)} km • 
                    Days until reentry: {formatDaysUntil(prediction.daysUntilReentry)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Predicted Reentry</div>
                  <div className="text-white font-medium">
                    {prediction.daysUntilReentry <= 1 ? 'IMMINENT' : formatDate(prediction.reentryDate)}
                  </div>
                  {prediction.uncontrolledAssessment?.isUncontrolled && (
                    <div className="mt-2 text-xs text-red-400">
                      Risk: {prediction.uncontrolledAssessment.riskLevel?.toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerts View */}
      {!loading && view === 'alerts' && alerts.length === 0 && (
        <div className="bg-space-card rounded-lg p-8 text-center text-gray-400">
          No active reentry alerts
        </div>
      )}

      {!loading && view === 'alerts' && alerts.length > 0 && (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.alertId}
              className="bg-space-card rounded-lg p-4 border border-space-border hover:border-blue-500/50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ backgroundColor: getPriorityColor(alert.priority) + '20', color: getPriorityColor(alert.priority) }}
                    >
                      {alert.priority?.toUpperCase()}
                    </span>
                    <span
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ backgroundColor: getStatusColor(alert.status) + '20', color: getStatusColor(alert.status) }}
                    >
                      {alert.status?.toUpperCase()}
                    </span>
                    <span className="text-gray-400 text-sm">{alert.alertId}</span>
                  </div>
                  <div className="text-white font-medium mb-1">{alert.name}</div>
                  <div className="text-sm text-gray-400">
                    NORAD: {alert.noradCatId} • 
                    Predicted: {formatDate(alert.reentry?.predictedReentryDate)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Days Until Reentry</div>
                  <div className="text-2xl font-bold" style={{ color: getStatusColor(alert.reentry?.status) }}>
                    {alert.reentry?.daysUntilReentry?.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Prediction Detail Modal */}
      {selectedPrediction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedPrediction(null)}>
          <div className="bg-space-card rounded-lg p-6 max-w-2xl w-full border border-space-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedPrediction.name}</h2>
                <p className="text-gray-400">NORAD ID: {selectedPrediction.noradCatId}</p>
              </div>
              <button
                onClick={() => setSelectedPrediction(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Status</div>
                  <div className="font-medium" style={{ color: getStatusColor(selectedPrediction.status) }}>
                    {selectedPrediction.status?.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Confidence</div>
                  <div className="font-medium text-white">
                    {selectedPrediction.confidence?.toUpperCase() || 'N/A'}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Current Altitude</div>
                  <div className="font-medium text-white">
                    {selectedPrediction.currentAltitude?.toFixed(2)} km
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Orbital Velocity</div>
                  <div className="font-medium text-white">
                    {selectedPrediction.currentVelocity?.toFixed(2)} km/s
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Days Until Reentry</div>
                  <div className="font-medium text-white">
                    {formatDaysUntil(selectedPrediction.daysUntilReentry)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Predicted Reentry Date</div>
                  <div className="font-medium text-white">
                    {formatDate(selectedPrediction.reentryDate)}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Decay Rate</div>
                  <div className="font-medium text-white">
                    {selectedPrediction.decayRateKmPerDay} km/day
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Ballistic Coefficient</div>
                  <div className="font-medium text-white">
                    {selectedPrediction.ballisticCoefficient} m²/kg
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Inclination</div>
                  <div className="font-medium text-white">
                    {selectedPrediction.inclination?.toFixed(2)}°
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Eccentricity</div>
                  <div className="font-medium text-white">
                    {selectedPrediction.eccentricity?.toFixed(4)}
                  </div>
                </div>
              </div>
              
              {selectedPrediction.uncontrolledAssessment && (
                <div className="border-t border-space-border pt-4">
                  <div className="text-sm text-gray-400 mb-2">Uncontrolled Reentry Assessment</div>
                  <div className="bg-space-dark rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        selectedPrediction.uncontrolledAssessment.isUncontrolled 
                          ? 'bg-red-500/20 text-red-400' 
                          : 'bg-green-500/20 text-green-400'
                      }`}>
                        {selectedPrediction.uncontrolledAssessment.isUncontrolled ? 'UNCONTROLLED' : 'CONTROLLED'}
                      </span>
                      <span className="text-white font-medium">
                        Risk Level: {selectedPrediction.uncontrolledAssessment.riskLevel?.toUpperCase()}
                      </span>
                    </div>
                    {selectedPrediction.uncontrolledAssessment.reasons?.length > 0 && (
                      <ul className="text-sm text-gray-400">
                        {selectedPrediction.uncontrolledAssessment.reasons.map((reason, i) => (
                          <li key={i}>• {reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setSelectedPrediction(null)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reentry;
