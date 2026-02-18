/**
 * BullMQ Queue Service
 * Manages background jobs for heavy computations
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const { logger } = require('../utils/logger');

// Queue names
const QUEUES = {
  TLE_FETCH: 'tle-fetch',
  RISK_CALCULATION: 'risk-calculation',
  CONJUNCTION_DETECTION: 'conjunction-detection',
  DATA_EXPORT: 'data-export',
  NOTIFICATIONS: 'notifications'
};

// Redis connection settings
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null // Required for BullMQ
};

// Create queue instances
const queues = {};

/**
 * Initialize a queue
 */
const createQueue = (name, options = {}) => {
  const queue = new Queue(name, {
    connection: REDIS_CONFIG,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      ...options
    },
    ...options
  });
  
  queues[name] = queue;
  
  logger.info(`Queue created: ${name}`, { queue: name });
  
  return queue;
};

/**
 * Get or create a queue
 */
const getQueue = (name) => {
  if (!queues[name]) {
    return createQueue(name);
  }
  return queues[name];
};

/**
 * Add a job to a queue
 */
const addJob = async (queueName, jobName, data, options = {}) => {
  const queue = getQueue(queueName);
  
  const job = await queue.add(jobName, data, {
    priority: options.priority || 2,
    delay: options.delay || 0,
    timeout: options.timeout || 300000, // 5 minutes default
    ...options
  });
  
  logger.info(`Job added to queue`, {
    queue: queueName,
    jobId: job.id,
    jobName
  });
  
  return job;
};

/**
 * Schedule a recurring job
 */
const addRecurringJob = async (queueName, jobName, data, cronPattern) => {
  const queue = getQueue(queueName);
  
  const job = await queue.add(jobName, data, {
    repeat: {
      pattern: cronPattern,
      tz: 'UTC'
    }
  });
  
  logger.info(`Recurring job scheduled`, {
    queue: queueName,
    jobName,
    cronPattern,
    jobId: job.id
  });
  
  return job;
};

/**
 * Get job status
 */
const getJobStatus = async (queueName, jobId) => {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);
  
  if (!job) {
    return null;
  }
  
  const state = await job.getState();
  
  return {
    id: job.id,
    name: job.name,
    state,
    progress: job.progress(),
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
    createdAt: job.timestamp
  };
};

/**
 * Get queue statistics
 */
const getQueueStats = async (queueName) => {
  const queue = getQueue(queueName);
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);
  
  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed
  };
};

/**
 * Clean up completed/failed jobs
 */
const cleanQueue = async (queueName, grace = 5000) => {
  const queue = getQueue(queueName);
  
  const results = await Promise.all([
    queue.clean(grace, 100, 'completed'),
    queue.clean(grace, 100, 'failed')
  ]);
  
  logger.info(`Queue cleaned: ${queueName}`, {
    completed: results[0].length,
    failed: results[1].length
  });
  
  return {
    completed: results[0],
    failed: results[1]
  };
};

/**
 * Create a worker for processing jobs
 */
const createWorker = (queueName, processor, options = {}) => {
  const worker = new Worker(queueName, processor, {
    connection: REDIS_CONFIG,
    concurrency: options.concurrency || 5,
    limiter: {
      max: options.maxJobsPerSecond || 10,
      duration: 1000
    },
    ...options
  });
  
  worker.on('completed', (job) => {
    logger.debug(`Job completed`, {
      queue: queueName,
      jobId: job.id,
      jobName: job.name
    });
  });
  
  worker.on('failed', (job, err) => {
    logger.error(`Job failed`, {
      queue: queueName,
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
      attempts: job?.attemptsMade
    });
  });
  
  worker.on('progress', (job, progress) => {
    logger.debug(`Job progress`, {
      queue: queueName,
      jobId: job.id,
      progress
    });
  });
  
  logger.info(`Worker created for queue: ${queueName}`, {
    queue: queueName,
    concurrency: options.concurrency || 5
  });
  
  return worker;
};

// Predefined job processors

// TLE Fetch job processor
const tleFetchProcessor = async (job) => {
  const { fetchAndStoreTLE } = require('./tleFetcher');
  const { calculateAllRiskScores } = require('./riskEngine');
  
  logger.info(`Processing TLE fetch job`, { jobId: job.id });
  
  const result = await fetchAndStoreTLE();
  await calculateAllRiskScores();
  
  return result;
};

// Risk Calculation job processor
const riskCalculationProcessor = async (job) => {
  const { calculateAllRiskScoresWithConjunctions } = require('./riskEngine');
  const { runConjunctionDetection } = require('./conjunctionEngine');
  
  const { includeConjunctions = true } = job.data;
  
  logger.info(`Processing risk calculation job`, { 
    jobId: job.id,
    includeConjunctions 
  });
  
  if (includeConjunctions) {
    await runConjunctionDetection();
  }
  
  const result = await calculateAllRiskScoresWithConjunctions();
  
  return result;
};

// Conjunction Detection job processor
const conjunctionDetectionProcessor = async (job) => {
  const { runConjunctionDetection } = require('./conjunctionEngine');
  
  logger.info(`Processing conjunction detection job`, { jobId: job.id });
  
  const result = await runConjunctionDetection();
  
  return result;
};

// Job management functions
const jobs = {
  /**
   * Schedule TLE fetch
   */
  scheduleTLEFetch: (options = {}) => {
    return addJob(QUEUES.TLE_FETCH, 'fetch-tle', options.data || {}, options);
  },

  /**
   * Schedule risk calculation
   */
  scheduleRiskCalculation: (options = {}) => {
    return addJob(QUEUES.RISK_CALCULATION, 'calculate-risk', options.data || {}, options);
  },

  /**
   * Schedule conjunction detection
   */
  scheduleConjunctionDetection: (options = {}) => {
    return addJob(QUEUES.CONJUNCTION_DETECTION, 'detect-conjunctions', options.data || {}, options);
  },

  /**
   * Schedule full analysis pipeline
   */
  scheduleFullAnalysis: async (options = {}) => {
    const { priority = 1 } = options;
    
    // Chain jobs using dependencies
    const tleJob = await jobs.scheduleTLEFetch({ priority });
    const riskJob = await jobs.scheduleRiskCalculation({ 
      priority,
      delay: 1000 // Wait for TLE to complete
    });
    const conjunctionJob = await jobs.scheduleConjunctionDetection({
      priority,
      delay: 2000 // Wait for risk to complete
    });
    
    return { tleJob, riskJob, conjunctionJob };
  },

  /**
   * Get status of all queues
   */
  getAllQueueStats: async () => {
    const stats = {};
    
    for (const queueName of Object.values(QUEUES)) {
      stats[queueName] = await getQueueStats(queueName);
    }
    
    return stats;
  }
};

module.exports = {
  QUEUES,
  createQueue,
  getQueue,
  addJob,
  addRecurringJob,
  getJobStatus,
  getQueueStats,
  cleanQueue,
  createWorker,
  tleFetchProcessor,
  riskCalculationProcessor,
  conjunctionDetectionProcessor,
  jobs
};
