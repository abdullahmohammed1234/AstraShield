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
  // Collision probability data (NASA/Caltech methodology)
  probabilityOfCollision: {
    type: Number,
    default: 0
  },
  probabilityFormatted: {
    type: String,
    default: '0'
  },
  // Uncertainty data for visualization
  uncertaintyData: {
    // Combined covariance matrix (flattened 9-element array)
    combinedCovariance: {
      type: [Number],
      default: []
    },
    // 1-sigma miss distance uncertainty (km)
    positionUncertainty1Sigma: {
      type: Number,
      default: 0
    },
    // 3-sigma miss distance uncertainty (km)
    positionUncertainty3Sigma: {
      type: Number,
      default: 0
    },
    // Ellipsoid semi-axes at 1-sigma (km)
    ellipsoid1Sigma: {
      semiMajor: Number,
      semiMinor: Number,
      semiVertical: Number
    },
    // Ellipsoid semi-axes at 3-sigma (km)
    ellipsoid3Sigma: {
      semiMajor: Number,
      semiMinor: Number,
      semiVertical: Number
    }
  },
  // Hard body radii used in calculation
  primaryRadius: {
    type: Number,
    default: 5
  },
  secondaryRadius: {
    type: Number,
    default: 1
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

conjunctionSchema.index({ satellite1: 1, satellite2: 1 }, { unique: true });
conjunctionSchema.index({ createdAt: -1 });
conjunctionSchema.index({ probabilityOfCollision: -1 });

module.exports = mongoose.model('Conjunction', conjunctionSchema);
