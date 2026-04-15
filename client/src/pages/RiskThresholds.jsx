import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const RiskThresholds = () => {
  const queryClient = useQueryClient();
  const [selectedShell, setSelectedShell] = useState('leo');
  const [editingValue, setEditingValue] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['riskThresholds'],
    queryFn: () => api.get('/risk-thresholds').then(r => r.data.data)
  });

  const updateThreshold = useMutation({
    mutationFn: ({ shell, level, value }) => 
      api.put(`/risk-thresholds/${shell}/${level}`, { value }),
    onSuccess: () => queryClient.invalidateQueries(['riskThresholds'])
  });

  const resetThresholds = useMutation({
    mutationFn: () => api.post('/risk-thresholds/reset'),
    onSuccess: () => queryClient.invalidateQueries(['riskThresholds'])
  });

  const handleUpdate = (level) => {
    if (editingValue === null) return;
    updateThreshold.mutate({ shell: selectedShell, level, value: editingValue });
    setEditingValue(null);
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'critical': return 'text-red-400 border-red-400';
      case 'high': return 'text-orange-400 border-orange-400';
      case 'medium': return 'text-yellow-400 border-yellow-400';
      default: return 'text-green-400 border-green-400';
    }
  };

  if (isLoading) return <div className="p-6 text-white/50">Loading...</div>;

  const currentShell = data?.thresholds?.[selectedShell];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-orbitron font-bold text-white">Risk Thresholds</h1>
        <button
          onClick={() => resetThresholds.mutate()}
          className="text-sm text-red-400 hover:text-red-300"
        >
          Reset to Defaults
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {['vleo', 'leo', 'meo', 'geo'].map((shell) => (
          <button
            key={shell}
            onClick={() => setSelectedShell(shell)}
            className={`p-4 rounded-xl border transition-all ${
              selectedShell === shell
                ? 'bg-neon-cyan/20 border-neon-cyan/50 text-neon-cyan'
                : 'bg-deep-space/50 border-glass-border text-white/70 hover:bg-white/5'
            }`}
          >
            <div className="text-lg font-semibold uppercase">{shell}</div>
            <div className="text-sm opacity-70">
              {shell === 'vleo' ? '200-300 km' :
               shell === 'leo' ? '300-2000 km' :
               shell === 'meo' ? '2,000-35,786 km' : '35,786+ km'}
            </div>
          </button>
        ))}
      </div>

      <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
        <h2 className="text-xl font-semibold text-white mb-6">
          Threshold Configuration: {selectedShell.toUpperCase()}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {currentShell && Object.entries(currentShell).filter(([k]) => typeof k === 'string' || !isNaN(k)).map(([level, value]) => {
            if (level === 'name') return null;
            return (
              <div key={level} className="p-4 bg-space-dark rounded-lg border border-glass-border">
                <div className={`text-sm font-medium mb-2 ${getRiskColor(level)}`}>
                  {level.toUpperCase()}
                </div>
                <div className="flex items-center gap-2">
                  {editingValue !== null ? (
                    <>
                      <input
                        type="number"
                        value={editingValue}
                        onChange={(e) => setEditingValue(parseFloat(e.target.value))}
                        className="w-20 bg-deep-space border border-glass-border rounded px-2 py-1 text-white"
                      />
                      <button
                        onClick={() => handleUpdate(level)}
                        className="text-neon-cyan text-sm hover:underline"
                      >
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl text-white font-mono">{value}</span>
                      <span className="text-white/50">km</span>
                      <button
                        onClick={() => setEditingValue(value)}
                        className="ml-auto text-white/50 hover:text-white"
                      >
                        ✏️
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
        <h2 className="text-xl font-semibold text-white mb-4">Risk Assessment Preview</h2>
        <div className="space-y-3">
          {[1, 5, 10, 25, 50, 100].map((distance) => {
            const assessment = data?.thresholds?.[selectedShell];
            const getLevel = (d) => {
              if (d <= assessment?.critical) return 'critical';
              if (d <= assessment?.high) return 'high';
              if (d <= assessment?.medium) return 'medium';
              return 'low';
            };
            const level = getLevel(distance);
            return (
              <div key={distance} className="flex items-center justify-between p-3 bg-space-dark rounded-lg">
                <span className="text-white">{distance} km distance</span>
                <span className={`px-3 py-1 rounded text-sm ${getRiskColor(level)} bg-${level === 'critical' ? 'red' : level === 'high' ? 'orange' : level === 'medium' ? 'yellow' : 'green'}-400/10`}>
                  {level.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-deep-space/50 rounded-xl p-6 border border-glass-border">
        <h2 className="text-xl font-semibold text-white mb-4">Export / Import</h2>
        <div className="flex gap-4">
          <button
            onClick={() => api.get('/risk-thresholds/export').then(r => console.log(r.data))}
            className="px-4 py-2 bg-cosmic-blue/20 text-cosmic-blue rounded-lg border border-cosmic-blue/30"
          >
            Export Configuration
          </button>
          <button
            onClick={() => alert('Import feature - paste JSON in console')}
            className="px-4 py-2 bg-white/10 text-white rounded-lg border border-white/20"
          >
            Import Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default RiskThresholds;