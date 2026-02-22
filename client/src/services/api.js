import axios from 'axios';

const API_BASE = '/api';

// Create axios instance with optimized defaults
const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for error handling
api.interceptors.request.use(
  (config) => config,
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for standardized error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      console.error(`API Error ${status}:`, data?.error || 'Unknown error');
    } else if (error.request) {
      console.error('Network error: No response from server');
    } else {
      console.error('Request error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Maintain backward compatibility - return axios promises directly
export const satelliteApi = {
  getAll: (limit = 300) => api.get(`/satellites?limit=${Math.min(limit, 1000)}`),
  getById: (id) => api.get(`/satellites/${id}`),
  getPositions: (limit = 300) => api.get(`/satellites/positions?limit=${Math.min(limit, 500)}`),
  getOrbit: (id) => api.get(`/satellites/orbit/${id}`),
  search: (query, limit = 20) => {
    if (!query || query.length < 2) return Promise.resolve({ data: [] });
    return api.get(`/satellites/search?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 100)}`);
  },
  getStatistics: () => api.get('/satellites/statistics'),
  refreshTLE: () => api.post('/satellites/refresh')
};

export const riskApi = {
  calculate: () => api.post('/risk/calculate'),
  getAll: (minRisk = 0, limit = 100) => api.get(`/risk?minRisk=${minRisk}&limit=${Math.min(limit, 1000)}`),
  getAlerts: () => api.get('/risk/alerts'),
  getStatistics: () => api.get('/risk/statistics'),
  getCongestion: () => api.get('/risk/congestion'),
  getClusters: () => api.get('/risk/clusters'),
  getDensity: () => api.get('/risk/density'),
  simulate: (data) => api.post('/risk/simulate', data),
  // Maneuver analysis
  getManeuverOptions: (noradCatId) => api.get(`/risk/maneuvers/${noradCatId}`),
  compareManeuvers: (data) => api.post('/risk/maneuvers/compare', data),
  // Historical risk trends
  getTrends: (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return api.get(`/risk/trends${queryParams ? `?${queryParams}` : ''}`);
  },
  getSeasonalAnalysis: (years = 2) => api.get(`/risk/seasonal?years=${years}`),
  getLatestSnapshot: (type = 'daily') => api.get(`/risk/latest?type=${type}`),
  createSnapshot: (type = 'daily') => api.post('/risk/snapshot', { type }),
  generateSampleData: (days = 90) => api.post(`/risk/generate-sample?days=${days}`)
};

export const launchWindowApi = {
  analyze: (data) => api.post('/launch-window/analyze', data),
  getScore: (data) => api.post('/launch-window/score', data),
  findWindows: (data) => api.post('/launch-window/windows', data),
  getDebrisDensity: (altitude) => api.get(`/launch-window/debris/${altitude}`),
  analyzeInclination: (degrees) => api.get(`/launch-window/inclination/${degrees}`),
  getOptimalAltitudes: (inclination) => api.get(`/launch-window/altitudes/${inclination}`)
};

export const webhookApi = {
  getAll: () => api.get('/webhooks'),
  create: (config) => api.post('/webhooks', config),
  update: (id, config) => api.put(`/webhooks/${id}`, config),
  delete: (id) => api.delete(`/webhooks/${id}`),
  test: (id) => api.post(`/webhooks/${id}/test`)
};

export const conjunctionApi = {
  getAll: (limit = 100) => api.get(`/conjunctions?limit=${Math.min(limit, 500)}`),
  getHighRisk: (level = 'high') => api.get(`/conjunctions/high?level=${level}`),
  getStatistics: () => api.get('/conjunctions/statistics'),
  runDetection: () => api.post('/conjunctions/run'),
  getDetailedAnalysis: (satA, satB) => api.get(`/conjunctions/analysis/${satA}/${satB}`)
};

export const alertApi = {
  getAll: (limit = 50) => api.get(`/alerts?limit=${Math.min(limit, 200)}`),
  getUnread: () => api.get('/alerts/unread'),
  markAsRead: (id) => api.put(`/alerts/${id}/read`),
  markAllAsRead: () => api.put('/alerts/read-all'),
  delete: (id) => api.delete(`/alerts/${id}`),
  getStatistics: () => api.get('/alerts/statistics'),
  configure: (config) => api.post('/alerts/configure', config),
  getConfig: () => api.get('/alerts/config')
};

export const reentryApi = {
  getAll: (limit = 50) => api.get(`/reentry?limit=${Math.min(limit, 500)}`),
  getUpcoming: (days = 7) => api.get(`/reentry/upcoming?days=${days}`),
  getStatistics: () => api.get('/reentry/statistics'),
  getById: (id) => api.get(`/reentry/${id}`)
};

export const reportApi = {
  generate: (type) => api.post('/reports/generate', { type }),
  getAll: (limit = 20) => api.get(`/reports?limit=${Math.min(limit, 100)}`),
  getById: (id) => api.get(`/reports/${id}`),
  download: (id) => api.get(`/reports/${id}/download`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/reports/${id}`)
};

export const mlPredictionApi = {
  // Risk predictions
  getPredictions: (horizons = '24h,48h,72h') => 
    api.get(`/ml/predictions?horizons=${horizons}`),
  getHighRiskPeriods: (days = 7) => 
    api.get(`/ml/high-risk-periods?days=${days}`),
  getPredictionHistory: (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return api.get(`/ml/predictions/history${queryParams ? `?${queryParams}` : ''}`);
  },
  
  // Anomaly detection
  detectAllAnomalies: (limit = 100) => 
    api.get(`/ml/anomalies?limit=${limit}`),
  detectSatelliteAnomalies: (noradCatId) => 
    api.get(`/ml/anomalies/${noradCatId}`),
  getAnomalyHistory: (noradCatId, days = 7) => 
    api.get(`/ml/anomalies/${noradCatId}/history?days=${days}`),
  
  // Model management
  getModelStatus: () => api.get('/ml/status'),
  retrainModels: () => api.post('/ml/retrain')
};

export default api;
