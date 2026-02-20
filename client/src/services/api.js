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

export const conjunctionApi = {
  getAll: (limit = 100) => api.get(`/conjunctions?limit=${Math.min(limit, 500)}`),
  getHighRisk: (level = 'high') => api.get(`/conjunctions/high?level=${level}`),
  getStatistics: () => api.get('/conjunctions/stats'),
  runDetection: () => api.post('/conjunctions/run'),
  getDetailedAnalysis: (satA, satB) => api.get(`/conjunctions/analysis/${satA}/${satB}`)
};

export const alertApi = {
  getAll: (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return api.get(`/alerts${queryParams ? `?${queryParams}` : ''}`);
  },
  getById: (alertId) => api.get(`/alerts/${alertId}`),
  acknowledge: (alertId, data) => api.post(`/alerts/${alertId}/acknowledge`, data),
  escalate: (alertId, data) => api.post(`/alerts/${alertId}/escalate`, data),
  resolve: (alertId, data) => api.post(`/alerts/${alertId}/resolve`, data),
  close: (alertId, data) => api.post(`/alerts/${alertId}/close`, data),
  getStatistics: () => api.get('/alerts/statistics'),
  getUnacknowledged: () => api.get('/alerts/unacknowledged')
};

export const webhookApi = {
  getAll: () => api.get('/alerts/webhooks'),
  getById: (webhookId) => api.get(`/alerts/webhooks/${webhookId}`),
  create: (data) => api.post('/alerts/webhooks', data),
  update: (webhookId, data) => api.put(`/alerts/webhooks/${webhookId}`, data),
  delete: (webhookId) => api.delete(`/alerts/webhooks/${webhookId}`),
  test: (webhookId) => api.post(`/alerts/webhooks/${webhookId}/test`)
};

export const reentryApi = {
  getAll: (params = {}) => {
    const queryParams = new URLSearchParams(params).toString();
    return api.get(`/reentry${queryParams ? `?${queryParams}` : ''}`);
  },
  getById: (noradCatId) => api.get(`/reentry/${noradCatId}`),
  getAlerts: () => api.get('/reentry/alerts'),
  getStatistics: () => api.get('/reentry/statistics'),
  getOrbitalParams: (noradCatId) => api.get(`/reentry/orbital/${noradCatId}`)
};

export default api;
