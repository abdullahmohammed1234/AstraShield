const mongoose = require('mongoose');

const debrisPopulationSchema = new mongoose.Schema({
  snapshotDate: {
    type: Date,
    required: true,
    index: true
  },
  orbitalShell: {
    type: String,
    required: true,
    enum: ['LEO', 'MEO', 'GEO'],
    index: true
  },
  altitudeMin: {
    type: Number,
    required: true
  },
  altitudeMax: {
    type: Number,
    required: true
  },
  totalObjectCount: {
    type: Number,
    required: true,
    default: 0
  },
  debrisCount: {
    type: Number,
    required: true,
    default: 0
  },
  satelliteCount: {
    type: Number,
    required: true,
    default: 0
  },
  fragmentationDebris: {
    type: Number,
    default: 0
  },
  missionRelatedDebris: {
    type: Number,
    default: 0
  },
  collisionDebris: {
    type: Number,
    default: 0
  },
  defunctSatellites: {
    type: Number,
    default: 0
  },
  rocketBodies: {
    type: Number,
    default: 0
  },
  averageAltitude: {
    type: Number,
    default: 0
  },
  density: {
    type: Number,
    default: 0
  },
  radarCrossSection: {
    small: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    large: { type: Number, default: 0 }
  }
});

debrisPopulationSchema.index({ orbitalShell: 1, snapshotDate: -1 });
debrisPopulationSchema.index({ snapshotDate: -1, orbitalShell: 1 });

debrisPopulationSchema.virtual('objectDensityPer1000km').get(function() {
  if (this.altitudeMax - this.altitudeMin === 0) return 0;
  return this.totalObjectCount / ((this.altitudeMax - this.altitudeMin) / 1000);
});

debrisPopulationSchema.set('toJSON', { virtuals: true });
debrisPopulationSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('DebrisPopulation', debrisPopulationSchema);