const mongoose = require('mongoose');

const breakupEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: false,
    default: function() {
      return `Breakup Event ${new Date().toISOString()}`;
    }
  },
  eventDate: {
    type: Date,
    required: false,
    default: Date.now
  },
  sourceObject: {
    noradCatId: Number,
    name: String,
    type: {
      type: String,
      enum: ['satellite', 'rocket', 'debris', 'unknown'],
      default: 'unknown'
    }
  },
  eventType: {
    type: String,
    required: true,
    enum: ['collision', 'explosion', 'fragmentation', 'ant-satellite', 'simulated'],
    index: true
  },
  location: {
    altitude: Number,
    inclination: Number,
    raan: Number
  },
  orbitalShell: {
    type: String,
    required: true,
    enum: ['LEO', 'MEO', 'GEO']
  },
  debrisGenerated: {
    type: Number,
    required: true,
    default: 0
  },
  fragments: [{
    noradCatId: Number,
    size: {
      type: String,
      enum: ['tiny', 'small', 'medium', 'large']
    },
    initialAltitude: Number,
    finalAltitude: Number,
    inclination: Number,
    raan: Number,
    orbitalPeriod: Number,
    decayed: { type: Boolean, default: false },
    decayedDate: Date
  }],
  sizeDistribution: {
    tiny: { type: Number, default: 0 },
    small: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    large: { type: Number, default: 0 }
  },
  simulation: {
    enabled: { type: Boolean, default: false },
    parameters: {
      satelliteMass: Number,
      explosionEnergy: Number,
      fragmentCount: Number,
      averageFragmentSize: Number,
      dispersionAngle: Number,
      velocityDelta: Number
    },
    results: {
      initialDebrisCount: Number,
      currentDebrisCount: Number,
      decayedCount: Number,
      avgDecayRate: Number,
      cascadeTriggered: { type: Boolean, default: false },
      cascadeProbability: Number,
      projectedCollisionRate: Number
    },
    createdAt: { type: Date, default: Date.now },
    completedAt: Date
  },
  status: {
    type: String,
    enum: ['active', 'decayed', 'monitoring', 'completed'],
    default: 'active'
  },
  lifetime: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

breakupEventSchema.index({ eventType: 1, eventDate: -1 });
breakupEventSchema.index({ orbitalShell: 1, status: 1 });
breakupEventSchema.index({ 'simulation.enabled': 1, 'simulation.createdAt': -1 });

breakupEventSchema.methods.calculateLifetime = function() {
  if (!this.eventDate) return 0;
  const endDate = this.simulation?.completedAt || new Date();
  return Math.floor((endDate - this.eventDate) / (1000 * 60 * 60 * 24));
};

breakupEventSchema.set('toJSON', { virtuals: true });
breakupEventSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('BreakupEvent', breakupEventSchema);