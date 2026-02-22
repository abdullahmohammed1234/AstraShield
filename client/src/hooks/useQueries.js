import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { satelliteApi, riskApi, conjunctionApi, alertApi, reentryApi, reportApi, mlPredictionApi } from '../services/api';

// Query keys for consistent cache management
export const queryKeys = {
  satellites: {
    all: ['satellites'],
    list: (limit = 50) => ['satellites', 'list', limit ?? 50],
    positions: (limit = 300) => ['satellites', 'positions', limit ?? 300],
    detail: (id) => ['satellites', 'detail', id ?? ''],
    orbit: (id) => ['satellites', 'orbit', id ?? ''],
    search: (query = '') => ['satellites', 'search', query || ''],
    stats: ['satellites', 'stats'],
  },
  risk: {
    all: ['risk'],
    list: (minRisk = 0, limit = 100) => ['risk', 'list', minRisk ?? 0, limit ?? 100],
    alerts: ['risk', 'alerts'],
    stats: ['risk', 'stats'],
    congestion: ['risk', 'congestion'],
    clusters: ['risk', 'clusters'],
    trends: (params = {}) => ['risk', 'trends', JSON.stringify(params || {})],
  },
  conjunctions: {
    all: ['conjunctions'],
    list: (limit = 100) => ['conjunctions', 'list', limit ?? 100],
    highRisk: (level = 'high') => ['conjunctions', 'highRisk', level ?? 'high'],
    stats: ['conjunctions', 'stats'],
    analysis: (satA = '', satB = '') => ['conjunctions', 'analysis', satA ?? '', satB ?? ''],
  },
  alerts: {
    all: ['alerts'],
    list: (limit = 50) => ['alerts', 'list', limit ?? 50],
    unread: ['alerts', 'unread'],
    stats: ['alerts', 'stats'],
  },
  reentry: {
    all: ['reentry'],
    list: (limit = 50) => ['reentry', 'list', limit ?? 50],
    upcoming: (days = 7) => ['reentry', 'upcoming', days ?? 7],
    stats: ['reentry', 'stats'],
  },
  ml: {
    predictions: (horizons = '24h,48h,72h') => ['ml', 'predictions', horizons || '24h,48h,72h'],
    highRiskPeriods: (days = 7) => ['ml', 'highRiskPeriods', days ?? 7],
    anomalies: (limit = 100) => ['ml', 'anomalies', limit ?? 100],
    modelStatus: ['ml', 'status'],
  },
};

// Satellite hooks
export const useSatellites = (limit = 300) => {
  return useQuery({
    queryKey: queryKeys.satellites.list(limit),
    queryFn: async () => {
      const response = await satelliteApi.getAll(limit);
      return response.data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

export const useSatellitePositions = (limit = 300) => {
  return useQuery({
    queryKey: queryKeys.satellites.positions(limit),
    queryFn: async () => {
      const response = await satelliteApi.getPositions(limit);
      return response.data;
    },
    staleTime: 1000 * 30, // 30 seconds - positions change frequently
    refetchInterval: 1000 * 60, // Refetch every minute
  });
};

export const useSatelliteDetail = (id) => {
  return useQuery({
    queryKey: queryKeys.satellites.detail(id),
    queryFn: async () => {
      const response = await satelliteApi.getById(id);
      return response.data;
    },
    enabled: !!id,
  });
};

export const useSatelliteSearch = (query, limit = 20) => {
  return useQuery({
    queryKey: queryKeys.satellites.search(query),
    queryFn: async () => {
      const response = await satelliteApi.search(query, limit);
      return response.data;
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 60, // 1 minute
  });
};

export const useSatelliteStatistics = () => {
  return useQuery({
    queryKey: queryKeys.satellites.stats,
    queryFn: async () => {
      const response = await satelliteApi.getStatistics();
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Risk hooks
export const useRiskData = (minRisk = 0, limit = 100) => {
  return useQuery({
    queryKey: queryKeys.risk.list(minRisk, limit),
    queryFn: async () => {
      const response = await riskApi.getAll(minRisk, limit);
      return response.data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

export const useRiskAlerts = () => {
  return useQuery({
    queryKey: queryKeys.risk.alerts,
    queryFn: async () => {
      const response = await riskApi.getAlerts();
      return response.data;
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 2, // Every 2 minutes
  });
};

export const useRiskStatistics = () => {
  return useQuery({
    queryKey: queryKeys.risk.stats,
    queryFn: async () => {
      const response = await riskApi.getStatistics();
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useRiskCongestion = () => {
  return useQuery({
    queryKey: queryKeys.risk.congestion,
    queryFn: async () => {
      const response = await riskApi.getCongestion();
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useRiskClusters = () => {
  return useQuery({
    queryKey: queryKeys.risk.clusters,
    queryFn: async () => {
      const response = await riskApi.getClusters();
      return response.data;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};

// Conjunction hooks
export const useConjunctions = (limit = 100) => {
  return useQuery({
    queryKey: queryKeys.conjunctions.list(limit),
    queryFn: async () => {
      const response = await conjunctionApi.getAll(limit);
      return response.data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

export const useHighRiskConjunctions = (level = 'high') => {
  return useQuery({
    queryKey: queryKeys.conjunctions.highRisk(level),
    queryFn: async () => {
      const response = await conjunctionApi.getHighRisk(level);
      return response.data;
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 2, // Every 2 minutes
  });
};

export const useConjunctionStatistics = () => {
  return useQuery({
    queryKey: queryKeys.conjunctions.stats,
    queryFn: async () => {
      const response = await conjunctionApi.getStatistics();
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useConjunctionAnalysis = (satA, satB) => {
  return useQuery({
    queryKey: queryKeys.conjunctions.analysis(satA, satB),
    queryFn: async () => {
      const response = await conjunctionApi.getDetailedAnalysis(satA, satB);
      return response.data;
    },
    enabled: !!satA && !!satB,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Alert hooks
export const useAlerts = (limit = 50) => {
  return useQuery({
    queryKey: queryKeys.alerts.list(limit),
    queryFn: async () => {
      const response = await alertApi.getAll(limit);
      return response.data;
    },
    staleTime: 1000 * 60, // 1 minute
  });
};

export const useUnreadAlerts = () => {
  return useQuery({
    queryKey: queryKeys.alerts.unread,
    queryFn: async () => {
      const response = await alertApi.getUnread();
      return response.data;
    },
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Every minute
  });
};

export const useAlertStatistics = () => {
  return useQuery({
    queryKey: queryKeys.alerts.stats,
    queryFn: async () => {
      const response = await alertApi.getStatistics();
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Reentry hooks
export const useReentryData = (limit = 50) => {
  return useQuery({
    queryKey: queryKeys.reentry.list(limit),
    queryFn: async () => {
      const response = await reentryApi.getAll(limit);
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useUpcomingReentries = (days = 7) => {
  return useQuery({
    queryKey: queryKeys.reentry.upcoming(days),
    queryFn: async () => {
      const response = await reentryApi.getUpcoming(days);
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useReentryStatistics = () => {
  return useQuery({
    queryKey: queryKeys.reentry.stats,
    queryFn: async () => {
      const response = await reentryApi.getStatistics();
      return response.data;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};

// ML Prediction hooks
export const useMLPredictions = (horizons = '24h,48h,72h') => {
  return useQuery({
    queryKey: queryKeys.ml.predictions(horizons),
    queryFn: async () => {
      const response = await mlPredictionApi.getPredictions(horizons);
      return response.data;
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
  });
};

export const useHighRiskPeriods = (days = 7) => {
  return useQuery({
    queryKey: queryKeys.ml.highRiskPeriods(days),
    queryFn: async () => {
      const response = await mlPredictionApi.getHighRiskPeriods(days);
      return response.data;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
};

export const useAnomalies = (limit = 100) => {
  return useQuery({
    queryKey: queryKeys.ml.anomalies(limit),
    queryFn: async () => {
      const response = await mlPredictionApi.detectAllAnomalies(limit);
      return response.data;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};

export const useModelStatus = () => {
  return useQuery({
    queryKey: queryKeys.ml.modelStatus,
    queryFn: async () => {
      const response = await mlPredictionApi.getModelStatus();
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Mutation hooks for invalidating queries after updates
export const useInvalidateSatellites = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.satellites.all });
};

export const useInvalidateRisk = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.risk.all });
};

export const useInvalidateConjunctions = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.conjunctions.all });
};

export const useInvalidateAlerts = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
};

export const useRefreshTLE = () => {
  const invalidate = useInvalidateSatellites();
  return useMutation({
    mutationFn: () => satelliteApi.refreshTLE(),
    onSuccess: () => invalidate(),
  });
};

export const useRunConjunctionDetection = () => {
  const invalidate = useInvalidateConjunctions();
  return useMutation({
    mutationFn: () => conjunctionApi.runDetection(),
    onSuccess: () => invalidate(),
  });
};

export const useMarkAlertAsRead = () => {
  const invalidate = useInvalidateAlerts();
  return useMutation({
    mutationFn: (id) => alertApi.markAsRead(id),
    onSuccess: () => invalidate(),
  });
};

export const useMarkAllAlertsAsRead = () => {
  const invalidate = useInvalidateAlerts();
  return useMutation({
    mutationFn: () => alertApi.markAllAsRead(),
    onSuccess: () => invalidate(),
  });
};
