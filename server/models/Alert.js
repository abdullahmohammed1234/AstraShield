const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  // Alert identification
  alertId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Reference to the conjunction that triggered this alert
  conjunctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conjunction',
    required: true,
    index: true
  },
  
  // Satellite information
  satellites: {
    satA: {
      noradCatId: Number,
      name: String
    },
    satB: {
      noradCatId: Number,
      name: String
    }
  },
  
  // Conjunction details
  conjunction: {
    closestApproachDistance: Number,
    timeOfClosestApproach: Date,
    relativeVelocity: Number,
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true
    }
  },
  
  // Alert status and lifecycle
  status: {
    type: String,
    enum: ['new', 'acknowledged', 'escalated', 'resolved', 'closed'],
    default: 'new',
    index: true
  },
  
  // Priority level for escalation
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  acknowledgedAt: Date,
  resolvedAt: Date,
  closedAt: Date,
  
  // Acknowledgment tracking
  acknowledgment: {
    acknowledgedBy: String,
    acknowledgmentNote: String,
    acknowledgmentMethod: {
      type: String,
      enum: ['websocket', 'api', 'webhook', 'email'],
      default: 'api'
    }
  },
  
  // Escalation tracking
  escalation: {
    currentLevel: {
      type: Number,
      default: 0
    },
    maxLevel: {
      type: Number,
      default: 3
    },
    lastEscalatedAt: Date,
    escalationHistory: [{
      level: Number,
      escalatedAt: Date,
      reason: String,
      notifiedChannels: [String]
    }]
  },
  
  // Notification tracking
  notifications: {
    websocket: {
      sent: { type: Boolean, default: false },
      sentAt: Date
    },
    email: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      recipients: [String]
    },
    slack: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      messageId: String
    },
    pagerduty: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      incidentId: String
    },
    customWebhooks: [{
      webhookId: mongoose.Schema.Types.ObjectId,
      url: String,
      sent: { type: Boolean, default: false },
      sentAt: Date,
      responseStatus: Number,
      responseBody: String
    }]
  },
  
  // Metadata
  metadata: {
    source: {
      type: String,
      default: 'conjunction-engine'
    },
    version: {
      type: String,
      default: '1.0'
    },
    tags: [String]
  }
});

// Compound index for efficient queries
alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ priority: 1, status: 1 });

// Virtual for time since creation
alertSchema.virtual('timeSinceCreated').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Method to acknowledge alert
alertSchema.methods.acknowledge = async function(acknowledgedBy, note = '', method = 'api') {
  this.status = 'acknowledged';
  this.acknowledgedAt = new Date();
  this.acknowledgment = {
    acknowledgedBy,
    acknowledgmentNote: note,
    acknowledgmentMethod: method
  };
  return this.save();
};

// Method to escalate alert
alertSchema.methods.escalate = async function(reason, notifiedChannels = []) {
  if (this.escalation.currentLevel < this.escalation.maxLevel) {
    this.escalation.currentLevel += 1;
    this.escalation.lastEscalatedAt = new Date();
    this.escalation.escalationHistory.push({
      level: this.escalation.currentLevel,
      escalatedAt: new Date(),
      reason,
      notifiedChannels
    });
    
    // Update priority based on escalation level
    if (this.escalation.currentLevel >= 2) {
      this.priority = 'critical';
    } else if (this.escalation.currentLevel >= 1) {
      this.priority = 'high';
    }
    
    if (this.status === 'new') {
      this.status = 'escalated';
    }
    
    return this.save();
  }
  return this;
};

// Method to resolve alert
alertSchema.methods.resolve = async function(resolvedBy, note = '') {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  if (!this.acknowledgedAt) {
    this.acknowledgedAt = new Date();
    this.acknowledgment = {
      acknowledgedBy: resolvedBy,
      acknowledgmentNote: note,
      acknowledgmentMethod: 'api'
    };
  }
  return this.save();
};

// Method to close alert
alertSchema.methods.close = async function(closedBy, note = '') {
  this.status = 'closed';
  this.closedAt = new Date();
  return this.save();
};

// Static method to generate alert ID
alertSchema.statics.generateAlertId = function() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ALT-${timestamp}-${random}`.toUpperCase();
};

module.exports = mongoose.model('Alert', alertSchema);
