import { useState, useEffect } from 'react';
import { alertApi } from '../services/api';
import { useAlerts, useAlertStatistics } from '../hooks/useQueries';
import { useAlertWebSocket } from '../hooks/useAlertWebSocket';
import { colors } from '../theme/colors';

const Alerts = () => {
  const [filter, setFilter] = useState('all');
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [mergedAlerts, setMergedAlerts] = useState([]);

  const { isConnected, alerts: wsAlerts } = useAlertWebSocket();
  
  // Use React Query hooks
  const { data: alertsData, isLoading, error, refetch } = useAlerts(50);
  const { data: statsData, refetch: refetchStats } = useAlertStatistics();
  
  // Get alerts from API data
  const alerts = alertsData?.data || [];
  
  // Use merged alerts if available, otherwise use API data
  const displayAlerts = wsAlerts.length > 0 ? mergedAlerts : alerts;
  const statistics = statsData?.data || null;

  // Merge WebSocket alerts with fetched alerts
  useEffect(() => {
    if (wsAlerts.length > 0 && !isLoading) {
      setMergedAlerts(() => {
        const merged = [...alerts];
        wsAlerts.forEach((wsAlert) => {
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
  }, [wsAlerts, alerts, isLoading]);

  const handleAcknowledge = async (alertId) => {
    try {
      setActionLoading(true);
      await alertApi.acknowledge(alertId, {
        acknowledgedBy: 'User',
        note: 'Acknowledged from dashboard'
      });
      refetch();
      refetchStats();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (alertId) => {
    try {
      setActionLoading(true);
      await alertApi.resolve(alertId, {
        resolvedBy: 'User',
        note: 'Resolved from dashboard'
      });
      refetch();
      refetchStats();
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async (alertId) => {
    try {
      setActionLoading(true);
      await alertApi.close(alertId, {
        closedBy: 'User',
        note: 'Closed from dashboard'
      });
      await fetchAlerts();
      await fetchStatistics();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getRiskColor = (level) => {
    const colorMap = {
      critical: colors.danger,
      high: colors.warning,
      medium: '#ffc107',
      low: colors.success
    };
    return colorMap[level] || colors.textSecondary;
  };

  const getStatusColor = (status) => {
    const colorMap = {
      new: colors.danger,
      acknowledged: colors.warning,
      escalated: colors.danger,
      resolved: colors.success,
      closed: colors.textSecondary
    };
    return colorMap[status] || colors.textSecondary;
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  const formatTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const filteredAlerts = filter === 'all' 
    ? alerts 
    : alerts.filter((a) => a.status === filter);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-space-card rounded-lg p-4 border border-space-border">
            <div className="text-2xl font-bold text-white">{statistics.total || 0}</div>
            <div className="text-sm text-gray-400">Total Alerts</div>
          </div>
          <div className="bg-space-card rounded-lg p-4 border border-space-border">
            <div className="text-2xl font-bold text-red-400">{statistics.byStatus?.new || 0}</div>
            <div className="text-sm text-gray-400">New</div>
          </div>
          <div className="bg-space-card rounded-lg p-4 border border-space-border">
            <div className="text-2xl font-bold text-yellow-400">{statistics.byStatus?.acknowledged || 0}</div>
            <div className="text-sm text-gray-400">Acknowledged</div>
          </div>
          <div className="bg-space-card rounded-lg p-4 border border-space-border">
            <div className="text-2xl font-bold text-orange-400">{statistics.unacknowledgedCritical || 0}</div>
            <div className="text-sm text-gray-400">Unacknowledged</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['all', 'new', 'acknowledged', 'escalated', 'resolved', 'closed'].map((status) => (
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

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-4 text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Alert List */}
      {!isLoading && filteredAlerts.length === 0 && (
        <div className="bg-space-card rounded-lg p-8 text-center text-gray-400">
          No alerts found
        </div>
      )}

      {!isLoading && filteredAlerts.length > 0 && (
        <div className="space-y-4">
          {filteredAlerts.map((alert) => (
            <div
              key={alert.alertId}
              className="bg-space-card rounded-lg p-4 border border-space-border hover:border-blue-500/50 transition-colors"
              onClick={() => setSelectedAlert(alert)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ backgroundColor: getRiskColor(alert.conjunction?.riskLevel || alert.riskLevel) + '20', color: getRiskColor(alert.conjunction?.riskLevel || alert.riskLevel) }}
                    >
                      {(alert.conjunction?.riskLevel || alert.riskLevel)?.toUpperCase()}
                    </span>
                    <span
                      className="px-2 py-1 rounded text-xs font-medium"
                      style={{ backgroundColor: getStatusColor(alert.status) + '20', color: getStatusColor(alert.status) }}
                    >
                      {alert.status?.toUpperCase()}
                    </span>
                    <span className="text-gray-400 text-sm">{alert.alertId}</span>
                    {alert.escalation?.currentLevel > 0 && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-orange-500/20 text-orange-400">
                        ESCALATED L{alert.escalation.currentLevel}
                      </span>
                    )}
                  </div>
                  <div className="text-white font-medium mb-1">
                    {alert.satellites?.satA?.name} ↔ {alert.satellites?.satB?.name}
                  </div>
                  <div className="text-sm text-gray-400">
                    Distance: {alert.conjunction?.closestApproachDistance?.toFixed(2)} km • 
                    Time: {formatDate(alert.conjunction?.timeOfClosestApproach)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">{formatTimeAgo(alert.createdAt)}</div>
                  <div className="flex gap-2 mt-2">
                    {alert.status === 'new' || alert.status === 'escalated' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcknowledge(alert.alertId);
                        }}
                        disabled={actionLoading}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                    ) : null}
                    {alert.status === 'acknowledged' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResolve(alert.alertId);
                        }}
                        disabled={actionLoading}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm text-white disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    )}
                    {alert.status === 'resolved' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClose(alert.alertId);
                        }}
                        disabled={actionLoading}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm text-white disabled:opacity-50"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedAlert(null)}>
          <div className="bg-space-card rounded-lg p-6 max-w-2xl w-full border border-space-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Alert Details</h2>
                <p className="text-gray-400">{selectedAlert.alertId}</p>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Risk Level</div>
                  <div className="font-medium" style={{ color: getRiskColor(selectedAlert.conjunction?.riskLevel) }}>
                    {selectedAlert.conjunction?.riskLevel?.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Status</div>
                  <div className="font-medium" style={{ color: getStatusColor(selectedAlert.status) }}>
                    {selectedAlert.status?.toUpperCase()}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Satellite A</div>
                  <div className="font-medium text-white">
                    {selectedAlert.satellites?.satA?.name} ({selectedAlert.satellites?.satA?.noradCatId})
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Satellite B</div>
                  <div className="font-medium text-white">
                    {selectedAlert.satellites?.satB?.name} ({selectedAlert.satellites?.satB?.noradCatId})
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Closest Approach</div>
                  <div className="font-medium text-white">
                    {selectedAlert.conjunction?.closestApproachDistance?.toFixed(2)} km
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Time of Closest Approach</div>
                  <div className="font-medium text-white">
                    {formatDate(selectedAlert.conjunction?.timeOfClosestApproach)}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Created</div>
                  <div className="font-medium text-white">{formatDate(selectedAlert.createdAt)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Escalation Level</div>
                  <div className="font-medium text-white">{selectedAlert.escalation?.currentLevel || 0}</div>
                </div>
              </div>
              
              {selectedAlert.acknowledgment && (
                <div className="border-t border-space-border pt-4">
                  <div className="text-sm text-gray-400 mb-2">Acknowledgment</div>
                  <div className="text-sm text-white">
                    By: {selectedAlert.acknowledgment.acknowledgedBy}<br />
                    At: {formatDate(selectedAlert.acknowledgment.acknowledgedAt)}<br />
                    Method: {selectedAlert.acknowledgment.acknowledgmentMethod}
                  </div>
                </div>
              )}
              
              {selectedAlert.escalation?.escalationHistory?.length > 0 && (
                <div className="border-t border-space-border pt-4">
                  <div className="text-sm text-gray-400 mb-2">Escalation History</div>
                  {selectedAlert.escalation.escalationHistory.map((esc, i) => (
                    <div key={i} className="text-sm text-white">
                      Level {esc.level}: {esc.reason} - {formatDate(esc.escalatedAt)}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex gap-2 mt-6">
              {selectedAlert.status === 'new' || selectedAlert.status === 'escalated' ? (
                <button
                  onClick={() => {
                    handleAcknowledge(selectedAlert.alertId);
                    setSelectedAlert(null);
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50"
                >
                  Acknowledge
                </button>
              ) : null}
              {selectedAlert.status === 'acknowledged' && (
                <button
                  onClick={() => {
                    handleResolve(selectedAlert.alertId);
                    setSelectedAlert(null);
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50"
                >
                  Resolve
                </button>
              )}
              {selectedAlert.status === 'resolved' && (
                <button
                  onClick={() => {
                    handleClose(selectedAlert.alertId);
                    setSelectedAlert(null);
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white disabled:opacity-50"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Alerts;
