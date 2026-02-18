const mongoose = require('mongoose');

const conjunctionSchema = new mongoose.Schema({
  satellite1: {
    type: Number,
    required: true,
    index: true
  },
  satellite2: {
    type: Number,
    required: true,
    index: true
  },
  closestApproachDistance: {
    type: Number,
    required: true
  },
  timeOfClosestApproach: {
    type: Date,
    required: true
  },
  relativeVelocity: {
    type: Number,
    required: true
  },
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  probability: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

conjunctionSchema.index({ satellite1: 1, satellite2: 1 }, { unique: true });
conjunctionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Conjunction', conjunctionSchema);
