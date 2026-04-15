/**
 * Metrics Collection System
 * Provides application metrics for monitoring and alerting
 */

const os = require('os');
const { logger } = require('./logger');

// In-memory metrics storage
const metrics = {
  // HTTP metrics
  http: {
    requests: {
      total: 0,
      byMethod: {},
      byStatus: {},
      byEndpoint: {}
    },
    responseTime: {
      sum: 0,
      count: 0,
      min: Infinity,
      max: 0,
      // Buckets for percentiles (ms)
      buckets: {
        '100': 0,
        '500': 0,
        '1000': 0,
        '2000': 0,
        '5000': 0,
        '10000': 0
      }
    },
    errors: {
      total: 0,
      byType: {}
    }
  },
  
  // Business metrics
  business: {
    satellitesLoaded: 0,
    conjunctionsDetected: 0,
    riskCalculations: 0,
    tleFetches: 0,
    cacheHits: 0,
    cacheMisses: 0
  },
  
  // System metrics
  system: {
    uptime: process.uptime(),
    memory: {
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0
    },
    cpu: {
      loadavg: [],
      usage: 0
    },
    eventLoop: {
      lag: 0
    }
  },
  
  // External services
  external: {
    tleApi: {
      calls: 0,
      errors: 0,
      avgResponseTime: 0
    },
    database: {
      queries: 0,
      errors: 0,
      avgQueryTime: 0
    },
    redis: {
      commands: 0,
      errors: 0,
      avgResponseTime: 0
    }
  }
};

// Event loop lag tracking
let eventLoopLag = 0;
setInterval(() => {
  const start = process.hrtime.bigint();
  setImmediate(() => {
    const end = process.hrtime.bigint();
    eventLoopLag = Number(end - start) / 1000000; // Convert to ms
  });
}, 1000);

/**
 * Record HTTP request
 */
const recordHttpRequest = (method, endpoint, statusCode, responseTime) => {
  metrics.http.requests.total++;
  
  // By method
  metrics.http.requests.byMethod[method] = 
    (metrics.http.requests.byMethod[method] || 0) + 1;
  
  // By status code range
  const statusRange = `${Math.floor(statusCode / 100)}xx`;
  metrics.http.requests.byStatus[statusRange] = 
    (metrics.http.requests.byStatus[statusRange] || 0) + 1;
  
  // By endpoint
  metrics.http.requests.byEndpoint[endpoint] = 
    (metrics.http.requests.byEndpoint[endpoint] || 0) + 1;
  
  // Response time
  metrics.http.responseTime.sum += responseTime;
  metrics.http.responseTime.count++;
  metrics.http.responseTime.min = Math.min(metrics.http.responseTime.min, responseTime);
  metrics.http.responseTime.max = Math.max(metrics.http.responseTime.max, responseTime);
  
  // Buckets
  if (responseTime < 100) metrics.http.responseTime.buckets['100']++;
  else if (responseTime < 500) metrics.http.responseTime.buckets['500']++;
  else if (responseTime < 1000) metrics.http.responseTime.buckets['1000']++;
  else if (responseTime < 2000) metrics.http.responseTime.buckets['2000']++;
  else if (responseTime < 5000) metrics.http.responseTime.buckets['5000']++;
  else metrics.http.responseTime.buckets['10000']++;
  
  // Error tracking
  if (statusCode >= 400) {
    metrics.http.errors.total++;
    metrics.http.errors.byType[statusCode] = 
      (metrics.http.errors.byType[statusCode] || 0) + 1;
  }
};

/**
 * Record business event
 */
const recordBusinessEvent = (event, value = 1) => {
  if (metrics.business[event] !== undefined) {
    metrics.business[event] += value;
  }
};

/**
 * Record external service call
 */
const recordExternalCall = (service, responseTime, isError = false) => {
  if (metrics.external[service]) {
    metrics.external[service].calls++;
    if (isError) {
      metrics.external[service].errors++;
    }
    // Update average response time
    const current = metrics.external[service].avgResponseTime;
    const calls = metrics.external[service].calls;
    metrics.external[service].avgResponseTime = 
      ((current * (calls - 1)) + responseTime) / calls;
  }
};

/**
 * Record cache hit/miss
 */
const recordCacheHit = (hit) => {
  if (hit) {
    metrics.business.cacheHits++;
  } else {
    metrics.business.cacheMisses++;
  }
};

/**
 * Update system metrics
 */
const updateSystemMetrics = () => {
  const memUsage = process.memoryUsage();
  
  metrics.system.uptime = process.uptime();
  metrics.system.memory = {
    rss: memUsage.rss,
    heapTotal: memUsage.heapTotal,
    heapUsed: memUsage.heapUsed,
    external: memUsage.external
  };
  metrics.system.cpu = {
    loadavg: os.loadavg(),
    usage: process.cpuUsage()
  };
  metrics.system.eventLoop.lag = eventLoopLag;
};

/**
 * Get metrics snapshot
 */
const getMetrics = () => {
  // Update system metrics
  updateSystemMetrics();
  
  // Calculate derived metrics
  const http = { ...metrics.http };
  
  const avgResponseTime = http.responseTime.count > 0
    ? http.responseTime.sum / http.responseTime.count
    : 0;
  
  const errorRate = http.requests.total > 0
    ? (http.errors.total / http.requests.total) * 100
    : 0;
  
  const cacheHitRate = (metrics.business.cacheHits + metrics.business.cacheMisses) > 0
    ? (metrics.business.cacheHits / (metrics.business.cacheHits + metrics.business.cacheMisses)) * 100
    : 0;
  
  return {
    http: {
      ...http,
      summary: {
        totalRequests: http.requests.total,
        avgResponseTime: Math.round(avgResponseTime),
        minResponseTime: http.responseTime.min === Infinity ? 0 : http.responseTime.min,
        maxResponseTime: http.responseTime.max,
        errorRate: errorRate.toFixed(2),
        cacheHitRate: cacheHitRate.toFixed(2)
      }
    },
    business: { ...metrics.business },
    system: { ...metrics.system },
    external: { ...metrics.external },
    timestamp: new Date().toISOString()
  };
};

/**
 * Reset metrics
 */
const resetMetrics = () => {
  metrics.http.requests.total = 0;
  metrics.http.requests.byMethod = {};
  metrics.http.requests.byStatus = {};
  metrics.http.requests.byEndpoint = {};
  metrics.http.responseTime.sum = 0;
  metrics.http.responseTime.count = 0;
  metrics.http.responseTime.min = Infinity;
  metrics.http.responseTime.max = 0;
  metrics.http.errors.total = 0;
  metrics.http.errors.byType = {};
  
  metrics.business.cacheHits = 0;
  metrics.business.cacheMisses = 0;
  
  logger.info('Metrics reset');
};

/**
 * Middleware for tracking HTTP metrics
 */
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - start;
    recordHttpRequest(req.method, req.path, res.statusCode, responseTime);
  });
  
  next();
};

/**
 * Get Prometheus-formatted metrics
 */
const getPrometheusMetrics = () => {
  const m = getMetrics();
  let output = '';
  
  // HTTP metrics
  output += `# HELP http_requests_total Total HTTP requests\n`;
  output += `# TYPE http_requests_total counter\n`;
  output += `http_requests_total ${m.http.requests.total}\n`;
  
  output += `\n# HELP http_response_time_seconds_avg Average response time in seconds\n`;
  output += `# TYPE http_response_time_seconds_avg gauge\n`;
  output += `http_response_time_seconds_avg ${(m.http.summary.avgResponseTime / 1000).toFixed(6)}\n`;
  
  output += `\n# HELP http_errors_total Total HTTP errors\n`;
  output += `# TYPE http_errors_total counter\n`;
  output += `http_errors_total ${m.http.errors.total}\n`;
  
  output += `\n# HELP http_error_rate Error rate percentage\n`;
  output += `# TYPE http_error_rate gauge\n`;
  output += `http_error_rate ${m.http.summary.errorRate}\n`;
  
  // Business metrics
  output += `\n# HELP business_satellites_loaded Number of satellites loaded\n`;
  output += `# TYPE business_satellites_loaded gauge\n`;
  output += `business_satellites_loaded ${m.business.satellitesLoaded}\n`;
  
  output += `\n# HELP business_cache_hit_rate Cache hit rate percentage\n`;
  output += `# TYPE business_cache_hit_rate gauge\n`;
  output += `business_cache_hit_rate ${m.http.summary.cacheHitRate}\n`;
  
  // System metrics
  output += `\n# HELP system_memory_rss_bytes Process RSS memory in bytes\n`;
  output += `# TYPE system_memory_rss_bytes gauge\n`;
  output += `system_memory_rss_bytes ${m.system.memory.rss}\n`;
  
  output += `\n# HELP system_memory_heap_used_bytes Process heap used in bytes\n`;
  output += `# TYPE system_memory_heap_used_bytes gauge\n`;
  output += `system_memory_heap_used_bytes ${m.system.memory.heapUsed}\n`;
  
  output += `\n# HELP system_cpu_loadavg System load average\n`;
  output += `# TYPE system_cpu_loadavg gauge\n`;
  output += `system_cpu_loadavg_1m ${m.system.cpu.loadavg[0]}\n`;
  output += `system_cpu_loadavg_5m ${m.system.cpu.loadavg[1]}\n`;
  output += `system_cpu_loadavg_15m ${m.system.cpu.loadavg[2]}\n`;
  
  output += `\n# HELP system_event_loop_lag_ms Event loop lag in milliseconds\n`;
  output += `# TYPE system_event_loop_lag_ms gauge\n`;
  output += `system_event_loop_lag_ms ${m.system.eventLoop.lag.toFixed(2)}\n`;
  
  return output;
};

// Periodic metrics logging
setInterval(() => {
  const m = getMetrics();
  
  logger.info('Periodic metrics snapshot', {
    requests_total: m.http.requests.total,
    avg_response_time_ms: m.http.summary.avgResponseTime,
    error_rate: m.http.summary.errorRate,
    memory_heap_mb: Math.round(m.system.memory.heapUsed / 1024 / 1024),
    event_loop_lag_ms: m.system.eventLoop.lag.toFixed(2)
  });
}, 60000); // Every minute

module.exports = {
  metrics,
  recordHttpRequest,
  recordBusinessEvent,
  recordExternalCall,
  recordCacheHit,
  updateSystemMetrics,
  getMetrics,
  resetMetrics,
  metricsMiddleware,
  getPrometheusMetrics
};
