import { useState, useEffect, useCallback } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, BarChart, Bar
} from 'recharts';
import { breakupApi } from '../services/api';

const BreakupSimulator = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [dispersion, setDispersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  const toast = { error: (msg) => console.error(msg), success: (msg) => console.log(msg) };
  
  const [params, setParams] = useState({
    name: '',
    eventType: 'explosion',
    initialAltitude: 400,
    inclination: 51,
    satelliteMass: 500,
    explosionEnergy: 1000000,
    fragmentCount: 200,
    avgFragmentSize: 10,
    dispersionAngle: 30
  });

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await breakupApi.getEvents({});
      setEvents(res.data.data || []);
    } catch (err) {
      console.error('Error fetching breakup events:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSelectEvent = async (event) => {
    setSelectedEvent(event);
    try {
      const res = await breakupApi.getDispersion(event.eventId);
      setDispersion(res.data.data);
    } catch (err) {
      setDispersion(null);
    }
  };

  const handleSimulate = async () => {
    if (!params.name) {
      toast.error('Please enter a simulation name');
      return;
    }
    
    try {
      setSimulating(true);
      const res = await breakupApi.simulate(params);
      toast.success('Breakup simulation completed');
      setShowForm(false);
      setParams({
        name: '',
        eventType: 'explosion',
        initialAltitude: 400,
        inclination: 51,
        satelliteMass: 500,
        explosionEnergy: 1000000,
        fragmentCount: 200,
        avgFragmentSize: 10,
        dispersionAngle: 30
      });
      fetchEvents();
      if (res.data.data?.event) {
        handleSelectEvent(res.data.data.event);
      }
    } catch (err) {
      toast.error('Simulation failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSimulating(false);
    }
  };

  const eventTypeColors = {
    collision: '#EF4444',
    explosion: '#F59E0B',
    fragmentation: '#8B5CF6',
    'ant-satellite': '#EC4899',
    simulated: '#22D3EE'
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US').format(num || 0);
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Breakup Event Simulator</h1>
          <p className="text-gray-400 mt-1">Simulate satellite breakup events and model debris cloud dispersion</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-colors"
        >
          {showForm ? 'Cancel' : 'New Simulation'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Simulation Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Simulation Name</label>
              <input
                type="text"
                value={params.name}
                onChange={(e) => setParams({ ...params, name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                placeholder="e.g., Cosmos-1408 Breakup"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Event Type</label>
              <select
                value={params.eventType}
                onChange={(e) => setParams({ ...params, eventType: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="explosion">Explosion</option>
                <option value="collision">Collision</option>
                <option value="fragmentation">Fragmentation</option>
                <option value="ant-satellite">ASAT Test</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Initial Altitude (km)</label>
              <input
                type="number"
                value={params.initialAltitude}
                onChange={(e) => setParams({ ...params, initialAltitude: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                min={200}
                max={50000}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Inclination (degrees)</label>
              <input
                type="number"
                value={params.inclination}
                onChange={(e) => setParams({ ...params, inclination: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                min={0}
                max={180}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Satellite Mass (kg)</label>
              <input
                type="number"
                value={params.satelliteMass}
                onChange={(e) => setParams({ ...params, satelliteMass: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Fragment Count</label>
              <input
                type="number"
                value={params.fragmentCount}
                onChange={(e) => setParams({ ...params, fragmentCount: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                min={10}
                max={10000}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Avg Fragment Size (kg)</label>
              <input
                type="number"
                value={params.avgFragmentSize}
                onChange={(e) => setParams({ ...params, avgFragmentSize: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Dispersion Angle (degrees)</label>
              <input
                type="number"
                value={params.dispersionAngle}
                onChange={(e) => setParams({ ...params, dispersionAngle: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {simulating ? 'Simulating...' : 'Run Simulation'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-semibold text-white">Breakup Events</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.map((event) => (
              <div
                key={event.eventId}
                onClick={() => handleSelectEvent(event)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedEvent?.eventId === event.eventId
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{event.name}</span>
                  <span
                    className="px-2 py-0.5 text-xs rounded-full"
                    style={{ backgroundColor: `${eventTypeColors[event.eventType]}30`, color: eventTypeColors[event.eventType] }}
                  >
                    {event.eventType}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  <div className="flex justify-between">
                    <span>Shell: {event.orbitalShell}</span>
                    <span>Debris: {formatNumber(event.debrisGenerated)}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>{new Date(event.eventDate).toLocaleDateString()}</span>
                    <span className={event.simulation?.results?.cascadeTriggered ? 'text-red-400' : 'text-green-400'}>
                      {event.simulation?.results?.cascadeTriggered ? 'Cascade!' : 'No cascade'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {events.length === 0 && !loading && (
              <div className="text-center text-gray-500 py-8">No breakup events recorded</div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selectedEvent ? (
            <>
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Event Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-400">Event ID</div>
                    <div className="text-white font-mono text-sm">{selectedEvent.eventId}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Event Type</div>
                    <div className="text-white">{selectedEvent.eventType}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Orbital Shell</div>
                    <div className="text-white">{selectedEvent.orbitalShell}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">Altitude</div>
                    <div className="text-white">{selectedEvent.location?.altitude} km</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Size Distribution</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { size: 'Tiny', count: selectedEvent.sizeDistribution?.tiny || 0 },
                        { size: 'Small', count: selectedEvent.sizeDistribution?.small || 0 },
                        { size: 'Medium', count: selectedEvent.sizeDistribution?.medium || 0 },
                        { size: 'Large', count: selectedEvent.sizeDistribution?.large || 0 }
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="size" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        labelStyle={{ color: '#F9FAFB' }}
                      />
                      <Bar dataKey="count" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {selectedEvent.simulation?.results && (
                <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Simulation Results</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="p-3 bg-gray-700/30 rounded-lg">
                      <div className="text-2xl font-bold text-white">
                        {formatNumber(selectedEvent.simulation.results.initialDebrisCount)}
                      </div>
                      <div className="text-sm text-gray-400">Initial Debris</div>
                    </div>
                    <div className="p-3 bg-gray-700/30 rounded-lg">
                      <div className="text-2xl font-bold text-white">
                        {formatNumber(selectedEvent.simulation.results.currentDebrisCount)}
                      </div>
                      <div className="text-sm text-gray-400">Current Debris</div>
                    </div>
                    <div className="p-3 bg-gray-700/30 rounded-lg">
                      <div className="text-2xl font-bold text-white">
                        {formatNumber(selectedEvent.simulation.results.decayedCount)}
                      </div>
                      <div className="text-sm text-gray-400">Decayed</div>
                    </div>
                    <div className="p-3 bg-gray-700/30 rounded-lg">
                      <div className="text-2xl font-bold text-cyan-400">
                        {(selectedEvent.simulation.results.cascadeProbability * 100).toFixed(1)}%
                      </div>
                      <div className="text-sm text-gray-400">Cascade Probability</div>
                    </div>
                    <div className="p-3 bg-gray-700/30 rounded-lg">
                      <div className="text-2xl font-bold text-white">
                        {selectedEvent.simulation.results.avgDecayRate.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-400">Avg Decay Rate/Year</div>
                    </div>
                    <div className="p-3 bg-gray-700/30 rounded-lg">
                      <div className={`text-2xl font-bold ${
                        selectedEvent.simulation.results.cascadeTriggered ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {selectedEvent.simulation.results.cascadeTriggered ? 'YES' : 'NO'}
                      </div>
                      <div className="text-sm text-gray-400">Cascade Triggered</div>
                    </div>
                  </div>
                </div>
              )}

              {dispersion && (
                <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                  <h3 className="text-lg font-semibold text-white mb-4">Cloud Dispersion Analysis</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-400">Altitude Range</div>
                      <div className="text-white">
                        {formatNumber(dispersion.altitudeRange.min)} - {formatNumber(dispersion.altitudeRange.max)} km
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Avg Altitude</div>
                      <div className="text-white">{formatNumber(dispersion.avgAltitude)} km</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Inclination Spread</div>
                      <div className="text-white">
                        {dispersion.inclinationSpread?.min?.toFixed(1) || '0'}° - {dispersion.inclinationSpread?.max?.toFixed(1) || '0'}°
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Decayed Fraction</div>
                      <div className="text-white">{dispersion.decayedFraction ? (dispersion.decayedFraction * 100).toFixed(1) : '0'}%</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-96 bg-gray-800/30 rounded-xl border border-gray-700">
              <div className="text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <p>Select an event or create a new simulation</p>
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

export default BreakupSimulator;