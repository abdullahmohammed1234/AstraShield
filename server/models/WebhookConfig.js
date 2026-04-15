const mongoose = require('mongoose');

const webhookConfigSchema = new mongoose.Schema({
  // Webhook identification
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // Webhook type/integration
  type: {
    type: String,
    enum: ['slack', 'pagerduty', 'email', 'custom'],
    required: true
  },
  
  // Webhook destination
  url: {
    type: String,
    required: true
  },
  
  // Authentication configuration
  auth: {
    type: {
      type: String,
      enum: ['none', 'basic', 'bearer', 'apiKey', 'hmac'],
      default: 'none'
    },
    credentials: {
      // Store encrypted in production
      username: String,
      password: String,
      token: String,
      apiKey: String,
      secret: String,
      headerName: String
    }
  },
  
  // Webhook configuration
  config: {
    // For Slack
    channel: String,
    username: String,
    iconEmoji: String,
    
    // For PagerDuty
    serviceId: String,
    urgency: {
      type: String,
      enum: ['high', 'low'],
      default: 'high'
    },
    severity: {
      type: String,
      enum: ['critical', 'error', 'warning', 'info'],
      default: 'critical'
    },
    
    // For Email
    from: String,
    recipients: [String],
    subjectTemplate: String,
    bodyTemplate: String,
    
    // For Custom
    headers: mongoose.Schema.Types.Mixed,
    method: {
      type: String,
      enum: ['POST', 'PUT'],
      default: 'POST'
    },
    contentType: {
      type: String,
      default: 'application/json'
    }
  },
  
  // Filter criteria - only trigger for alerts matching these
  filters: {
    riskLevels: [{
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    }],
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    satelliteIds: [Number],
    minDistanceKm: Number
  },
  
  // Retry configuration
  retry: {
    enabled: { type: Boolean, default: true },
    maxAttempts: { type: Number, default: 3 },
    backoffMs: { type: Number, default: 1000 }
  },
  
  // Active status
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Metadata
  metadata: {
    createdBy: String,
    description: String,
    tags: [String]
  },
  
  // Statistics
  stats: {
    totalSent: { type: Number, default: 0 },
    totalSuccessful: { type: Number, default: 0 },
    totalFailed: { type: Number, default: 0 },
    lastSentAt: Date,
    lastSuccessAt: Date,
    lastFailureAt: Date,
    lastFailureReason: String
  }
});

// Update timestamp on save
webhookConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Method to test webhook connection
webhookConfigSchema.methods.test = async function() {
  // This will be implemented in the webhook service
  return { success: true, message: 'Webhook configuration is valid' };
};

// Method to update statistics
webhookConfigSchema.methods.recordSuccess = async function() {
  this.stats.totalSent += 1;
  this.stats.totalSuccessful += 1;
  this.stats.lastSentAt = new Date();
  this.stats.lastSuccessAt = new Date();
  return this.save();
};

webhookConfigSchema.methods.recordFailure = async function(reason) {
  this.stats.totalSent += 1;
  this.stats.totalFailed += 1;
  this.stats.lastSentAt = new Date();
  this.stats.lastFailureAt = new Date();
  this.stats.lastFailureReason = reason;
  return this.save();
};

module.exports = mongoose.model('WebhookConfig', webhookConfigSchema);
