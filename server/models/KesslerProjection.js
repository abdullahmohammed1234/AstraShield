const mongoose = require('mongoose');

const kesslerProjectionSchema = new mongoose.Schema({
  projectionId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: false,
    default: function() {
      return `Projection ${new Date().toISOString().split('T')[0]}`;
    }
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  projectionHorizon: {
    type: Number,
    required: true,
    min: 10,
    max: 50
  },
  baseDate: {
    type: Date,
    required: false,
    default: Date.now
  },
  assumptions: {
    annualLaunchRate: { type: Number, default: 100 },
    breakupRate: { type: Number, default: 0.001 },
    avgFragmentsPerBreakup: { type: Number, default: 200 },
    solarActivity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    activeDebrisRemoval: { type: Boolean, default: false },
    removalRate: { type: Number, default: 0 },
    cascadeThreshold: { type: Number, default: 0.1 }
  },
  initialConditions: {
    leo: {
      totalObjects: Number,
      debrisObjects: Number,
      collisionRate: Number,
      avgObjectMass: Number
    },
    meo: {
      totalObjects: Number,
      debrisObjects: Number,
      collisionRate: Number,
      avgObjectMass: Number
    },
    geo: {
      totalObjects: Number,
      debrisObjects: Number,
      collisionRate: Number,
      avgObjectMass: Number
    }
  },
  projections: [{
    year: Number,
    date: Date,
    orbitalShell: {
      type: String,
      enum: ['LEO', 'MEO', 'GEO']
    },
    totalObjectCount: Number,
    debrisCount: Number,
    collisionRate: Number,
    cascadeProbability: Number,
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    projectedEvents: {
      collisions: Number,
      fragmentations: Number,
      reentries: Number
    }
  }],
  cascadeTrigger: {
    triggered: { type: Boolean, default: false },
    triggerYear: Number,
    triggerDate: Date,
    triggerProbability: Number,
    description: String
  },
  riskAssessment: {
    overallRiskScore: {
      type: Number,
      default: 0
    },
    trend: {
      type: String,
      enum: ['stable', 'increasing', 'decreasing', 'critical'],
      default: 'stable'
    },
    criticalityLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'extreme'],
      default: 'low'
    },
    confidence: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1
    }
  },
  modelParameters: {
    physicsBased: {
      dragCoefficient: Number,
      ballisticCoefficient: Number,
      solarFluxVariation: Number,
      atmosphericDensity: Number
    },
    statistical: {
      historicalCollisionRate: Number,
      fragmentationRate: Number,
      decayRate: Number,
      modelFit: Number
    }
  },
  sensitivityAnalysis: [{
    parameter: String,
    baselineValue: Number,
    variationMin: Number,
    variationMax: Number,
    impactOnRisk: Number
  }],
  status: {
    type: String,
    enum: ['running', 'completed', 'failed'],
    default: 'running'
  }
});

kesslerProjectionSchema.index({ createdAt: -1 });
kesslerProjectionSchema.index({ projectionHorizon: 1, createdAt: -1 });
kesslerProjectionSchema.index({ 'riskAssessment.criticalityLevel': 1 });

kesslerProjectionSchema.methods.getShellProjection = function(shell, year) {
  return this.projections.find(p => p.orbitalShell === shell && p.year === year);
};

kesslerProjectionSchema.set('toJSON', { virtuals: true });
kesslerProjectionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('KesslerProjection', kesslerProjectionSchema);