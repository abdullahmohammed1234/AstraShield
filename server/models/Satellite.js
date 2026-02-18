const mongoose = require('mongoose');

const satelliteSchema = new mongoose.Schema({
  noradCatId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    index: true
  },
  tleLine1: {
    type: String,
    required: true
  },
  tleLine2: {
    type: String,
    required: true
  },
  classification: {
    type: String,
    default: 'U'
  },
  internationalDesignator: {
    type: String,
    default: ''
  },
  epochYear: Number,
  epochDay: Number,
  meanMotionDot: Number,
  meanMotionDdot: Number,
  bstar: Number,
  ephemerisType: Number,
  elementSetNum: Number,
  inclination: Number,
  eccentricity: Number,
  raan: Number,
  argumentOfPerigee: Number,
  meanAnomaly: Number,
  meanMotion: Number,
  orbitNumber: Number,
  orbitalAltitude: {
    type: Number,
    default: 0,
    index: true
  },
  orbitalPeriod: {
    type: Number,
    default: 0
  },
  riskScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 1,
    index: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  },
  // Support for nested tle object
  tle: {
    line1: String,
    line2: String
  },
  orbitalData: {
    inclination: Number,
    eccentricity: Number,
    rightAscension: Number,
    argumentPerigee: Number,
    meanAnomaly: Number,
    meanMotion: Number,
    revNumber: Number
  }
});

// Compound indexes for common query patterns
satelliteSchema.index({ orbitalAltitude: 1, riskScore: -1 });
satelliteSchema.index({ riskScore: -1, orbitalAltitude: 1 });
satelliteSchema.index({ name: 'text' }); // For full-text search

// Virtual to get tleLine1 from either format
satelliteSchema.virtual('getTleLine1').get(function() {
  return this.tleLine1 || (this.tle && this.tle.line1);
});

// Virtual to get tleLine2 from either format
satelliteSchema.virtual('getTleLine2').get(function() {
  return this.tleLine2 || (this.tle && this.tle.line2);
});

satelliteSchema.set('toJSON', { virtuals: true });
satelliteSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Satellite', satelliteSchema);
