import { useState, useEffect, useCallback } from 'react';
import { conjunctionApi } from '../../services/api';

const getRiskBadgeStyles = (riskLevel) => {
  switch (riskLevel) {
    case 'critical':
      return 'bg-alert-red animate-pulse';
    case 'high':
      return 'bg-alert-red';
    case 'moderate':
      return 'bg-solar-amber';
    default:
      return 'bg-neon-cyan';
  }
};

const formatTimeToClosestApproach = (toca) => {
  if (!toca) return 'N/A';
  
  const now = new Date();
  const TCA = new Date(toca);
  const diffMs = TCA - now;
  
  if (diffMs < 0) return 'Passed';
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const ConjunctionPanel = ({ onConjunctionSelect }) => {
  const [conjunctions, setConjunctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchConjunctions = useCallback(async () => {
    try {
      setError(null);
      const response = await conjunctionApi.getHighRisk('high');
      setConjunctions(response.data.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching conjunctions:', err);
      setError('Failed to load conjunction data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConjunctions();
    const intervalId = setInterval(fetchConjunctions, 30000);
    return () => clearInterval(intervalId);
  }, [fetchConjunctions]);

  const handleConjunctionClick = (conjunction) => {
    if (onConjunctionSelect) {
      onConjunctionSelect({
        satA: conjunction.satA,
        satB: conjunction.satB,
        satAName: conjunction.satAName,
        satBName: conjunction.satBName,
        minDistanceKm: conjunction.minDistanceKm,
        timeOfClosestApproach: conjunction.timeOfClosestApproach,
        riskLevel: conjunction.riskLevel
      });
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-4">
        <h3 className="font-orbitron text-sm font-semibold text-white mb-4">
          CONJUNCTION ALERTS
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-orbitron text-sm font-semibold text-white">
          CONJUNCTION ALERTS
        </h3>
        {lastUpdated && (
          <span className="text-xs text-white/50">
            Updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && (
        <div className="text-alert-red text-sm text-center py-2 mb-2">
          {error}
        </div>
      )}

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {conjunctions.length === 0 ? (
          <p className="text-white/50 text-sm text-center py-4">
            No active conjunction alerts
          </p>
        ) : (
          conjunctions.map((conj, idx) => (
            <div
              key={conj.id || idx}
              onClick={() => handleConjunctionClick(conj)}
              className={`glass-card p-3 border transition-all cursor-pointer hover:scale-[1.02] ${
                conj.riskLevel === 'critical' 
                  ? 'border-alert-red/50 animate-pulse' 
                  : 'border-alert-red/20 hover:border-alert-red/50'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {conj.satAName}
                  </p>
                  <p className="text-white/70 text-xs">↔ {conj.satBName}</p>
                </div>
                <span 
                  className={`ml-2 px-2 py-0.5 text-xs font-orbitron rounded ${getRiskBadgeStyles(conj.riskLevel)}`}
                >
                  {conj.riskLevel?.toUpperCase()}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-white/50">Distance</span>
                  <p className="font-orbitron text-alert-red">
                    {conj.minDistanceKm?.toFixed(2)} km
                  </p>
                </div>
                <div>
                  <span className="text-white/50">TCA</span>
                  <p className="font-orbitron text-neon-cyan">
                    {formatTimeToClosestApproach(conj.timeOfClosestApproach)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {conjunctions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/50">Total Active:</span>
            <span className="font-orbitron text-alert-red">
              {conjunctions.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConjunctionPanel;
