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

// Modal component for detailed collision analysis
const CollisionAnalysisModal = ({ conjunction, onClose }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        setLoading(true);
        const response = await conjunctionApi.getDetailedAnalysis(
          conjunction.satA,
          conjunction.satB
        );
        if (response.data.success) {
          setAnalysis(response.data.data);
        } else {
          setError(response.data.error);
        }
      } catch (err) {
        setError('Failed to load detailed analysis');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (conjunction?.satA && conjunction?.satB) {
      fetchAnalysis();
    }
  }, [conjunction]);

  if (!conjunction) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="glass-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
          <h2 className="font-orbitron text-lg font-semibold text-white">
            Collision Analysis
          </h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-alert-red text-center py-8">
            {error}
          </div>
        ) : analysis ? (
          <div className="space-y-4">
            {/* Satellites */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-card p-3">
                <span className="text-white/50 text-xs">Primary</span>
                <p className="text-white font-medium">{analysis.conjunction.satAName}</p>
                <span className="text-neon-cyan text-xs">ID: {analysis.conjunction.satA}</span>
              </div>
              <div className="glass-card p-3">
                <span className="text-white/50 text-xs">Secondary</span>
                <p className="text-white font-medium">{analysis.conjunction.satBName}</p>
                <span className="text-neon-cyan text-xs">ID: {analysis.conjunction.satB}</span>
              </div>
            </div>

            {/* Probability of Collision */}
            <div className="glass-card p-4 border-2 border-alert-red/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/70 text-sm">Probability of Collision (Pc)</span>
                <span className={`px-3 py-1 rounded font-orbitron text-sm ${
                  analysis.probabilityOfCollision > 1e-3 ? 'bg-alert-red animate-pulse' :
                  analysis.probabilityOfCollision > 1e-4 ? 'bg-alert-red' :
                  analysis.probabilityOfCollision > 1e-5 ? 'bg-solar-amber' : 'bg-neon-cyan'
                } text-black font-bold`}>
                  {analysis.probabilityFormatted}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                <div 
                  className={`h-2 rounded-full ${
                    analysis.probabilityOfCollision > 1e-3 ? 'bg-alert-red animate-pulse' :
                    analysis.probabilityOfCollision > 1e-4 ? 'bg-alert-red' :
                    analysis.probabilityOfCollision > 1e-5 ? 'bg-solar-amber' : 'bg-neon-cyan'
                  }`}
                  style={{ width: `${Math.min(100, Math.log10(analysis.probabilityOfCollision + 1e-10) * -20 + 60)}%` }}
                ></div>
              </div>
              <div className="text-xs text-white/50">
                NASA/Caltech Squared Miss Distance Method
              </div>
            </div>

            {/* Miss Distance */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-card p-3">
                <span className="text-white/50 text-xs">Miss Distance</span>
                <p className="font-orbitron text-alert-red text-xl">
                  {analysis.conjunction.closestApproachDistance?.toFixed(3)} km
                </p>
              </div>
              <div className="glass-card p-3">
                <span className="text-white/50 text-xs">Relative Velocity</span>
                <p className="font-orbitron text-neon-cyan text-xl">
                  {analysis.conjunction.relativeVelocity?.toFixed(2)} km/s
                </p>
              </div>
            </div>

            {/* Time of Closest Approach */}
            <div className="glass-card p-3">
              <span className="text-white/50 text-xs">Time of Closest Approach (TCA)</span>
              <p className="font-orbitron text-white">
                {new Date(analysis.conjunction.timeOfClosestApproach).toLocaleString()}
              </p>
              <p className="text-neon-cyan text-sm">
                {formatTimeToClosestApproach(analysis.conjunction.timeOfClosestApproach)}
              </p>
            </div>

            {/* Uncertainty Ellipsoids */}
            {analysis.uncertaintyData?.combined && (
              <div className="glass-card p-4">
                <h3 className="font-orbitron text-sm font-semibold text-white mb-3">
                  Uncertainty Ellipsoids
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-white/70">1σ Position Uncertainty</span>
                    <span className="font-orbitron text-neon-cyan">
                      {analysis.uncertaintyData.combined.positionUncertainty1Sigma?.toFixed(3) || 'N/A'} km
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/70">3σ Position Uncertainty</span>
                    <span className="font-orbitron text-neon-cyan">
                      {analysis.uncertaintyData.combined.positionUncertainty3Sigma?.toFixed(3) || 'N/A'} km
                    </span>
                  </div>
                  
                  {/* 1-sigma ellipsoid */}
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <span className="text-white/50 text-xs">1σ Ellipsoid Semi-Axes</span>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <div className="text-center">
                        <span className="text-white/50 text-xs">Radial</span>
                        <p className="font-orbitron text-xs">
                          {analysis.uncertaintyData.combined.ellipsoid1Sigma?.semiMajor?.toFixed(2) || '0'} km
                        </p>
                      </div>
                      <div className="text-center">
                        <span className="text-white/50 text-xs">Tangential</span>
                        <p className="font-orbitron text-xs">
                          {analysis.uncertaintyData.combined.ellipsoid1Sigma?.semiMinor?.toFixed(2) || '0'} km
                        </p>
                      </div>
                      <div className="text-center">
                        <span className="text-white/50 text-xs">Normal</span>
                        <p className="font-orbitron text-xs">
                          {analysis.uncertaintyData.combined.ellipsoid1Sigma?.semiVertical?.toFixed(2) || '0'} km
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* 3-sigma ellipsoid */}
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <span className="text-white/50 text-xs">3σ Ellipsoid Semi-Axes</span>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <div className="text-center">
                        <span className="text-white/50 text-xs">Radial</span>
                        <p className="font-orbitron text-xs">
                          {analysis.uncertaintyData.combined.ellipsoid3Sigma?.semiMajor?.toFixed(2) || '0'} km
                        </p>
                      </div>
                      <div className="text-center">
                        <span className="text-white/50 text-xs">Tangential</span>
                        <p className="font-orbitron text-xs">
                          {analysis.uncertaintyData.combined.ellipsoid3Sigma?.semiMinor?.toFixed(2) || '0'} km
                        </p>
                      </div>
                      <div className="text-center">
                        <span className="text-white/50 text-xs">Normal</span>
                        <p className="font-orbitron text-xs">
                          {analysis.uncertaintyData.combined.ellipsoid3Sigma?.semiVertical?.toFixed(2) || '0'} km
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-white/50 text-center py-8">
            No analysis data available
          </div>
        )}
      </div>
    </div>
  );
};

const ConjunctionPanel = ({ onConjunctionSelect }) => {
  const [conjunctions, setConjunctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedConjunction, setSelectedConjunction] = useState(null);

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
    setSelectedConjunction(conjunction);
    
    if (onConjunctionSelect) {
      onConjunctionSelect({
        satA: conjunction.satA,
        satB: conjunction.satB,
        satAName: conjunction.satAName,
        satBName: conjunction.satBName,
        minDistanceKm: conjunction.minDistanceKm,
        timeOfClosestApproach: conjunction.timeOfClosestApproach,
        riskLevel: conjunction.riskLevel,
        probabilityOfCollision: conjunction.probabilityOfCollision
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
    <>
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
                
                {/* Probability of Collision */}
                {conj.probabilityOfCollision > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-white/50 text-xs">Pc</span>
                      <span className={`font-orbitron text-xs ${
                        conj.probabilityOfCollision > 1e-3 ? 'text-alert-red animate-pulse' :
                        conj.probabilityOfCollision > 1e-4 ? 'text-alert-red' :
                        conj.probabilityOfCollision > 1e-5 ? 'text-solar-amber' : 'text-neon-cyan'
                      }`}>
                        {conj.probabilityFormatted || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}
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

      {/* Detailed Analysis Modal */}
      {selectedConjunction && (
        <CollisionAnalysisModal 
          conjunction={selectedConjunction} 
          onClose={() => setSelectedConjunction(null)} 
        />
      )}
    </>
  );
};

export default ConjunctionPanel;
