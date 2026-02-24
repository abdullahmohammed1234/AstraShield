/**
 * ML Models for Risk Prediction
 * Implements ensemble methods (Random Forest, Gradient Boosting) and LSTM/GRU for time-series forecasting
 */

const tf = require('@tensorflow/tfjs');
const dataPreprocessor = require('./dataPreprocessor');

/**
 * Random Forest Ensemble Model using TensorFlow.js
 * Implements bagging with multiple decision tree-like neural networks
 */
class RandomForestModel {
  constructor(options = {}) {
    this.numTrees = options.numTrees || 10;
    this.maxDepth = options.maxDepth || 5;
    this.featureFraction = options.featureFraction || 0.8;
    this.learningRate = options.learningRate || 0.1;
    this.trees = [];
    this.isTrained = false;
    this.featureNames = [];
    this.featureStats = {};
    this.trainingDate = null;
    this.modelType = 'random_forest';
  }

  /**
   * Initialize the forest with multiple tree models
   */
  async initialize(featureNames) {
    this.featureNames = featureNames;
    this.trees = [];

    for (let i = 0; i < this.numTrees; i++) {
      // Each "tree" is a simple neural network with limited depth
      const model = tf.sequential();
      
      // Input layer - use all features
      model.add(tf.layers.dense({
        inputShape: [featureNames.length],
        units: Math.max(8, Math.floor(featureNames.length * this.featureFraction)),
        activation: 'relu',
        kernelInitializer: 'glorotNormal'
      }));

      // Hidden layers representing tree depth
      for (let d = 1; d < this.maxDepth; d++) {
        model.add(tf.layers.dense({
          units: Math.max(4, Math.floor(featureNames.length / (d * 2))),
          activation: 'relu',
          kernelInitializer: 'glorotNormal'
        }));
      }

      // Output layer for regression (risk level 0-3)
      model.add(tf.layers.dense({
        units: 1,
        activation: 'sigmoid'
      }));

      model.compile({
        optimizer: tf.train.adam(this.learningRate),
        loss: 'meanSquaredError'
      });

      this.trees.push(model);
    }
  }

  /**
   * Train the Random Forest model
   */
  async train(trainingData) {
    console.log(`Training Random Forest with ${this.numTrees} trees...`);

    if (!trainingData || trainingData.length < 10) {
      console.log('Insufficient training data, using default model');
      this.isTrained = true;
      return this;
    }

    // Prepare features
    const { features, stats } = dataPreprocessor.prepareFeatures(trainingData);
    this.featureStats = stats;
    const featureNames = Object.keys(features[0] || {});

    // Initialize forest
    await this.initialize(featureNames);

    // Prepare labels (normalized 0-1)
    const labels = trainingData
      .map(d => d.labels?.['horizon_24h'])
      .filter(l => l !== undefined)
      .map(l => l / 3); // Normalize to 0-1

    if (labels.length < 10) {
      console.log('Insufficient labels, using default model');
      this.isTrained = true;
      return this;
    }

    // Bootstrap sampling for each tree
    const xs = tf.tensor2d(features.map(f => featureNames.map(name => f[name] || 0)));
    const ys = tf.tensor2d(labels.map(l => [l]));

    // Train each tree on different bootstrap sample
    for (let i = 0; i < this.trees.length; i++) {
      const model = this.trees[i];
      
      // Bootstrap sampling
      const bootstrapIndices = this._bootstrapSample(labels.length);
      const bootstrapXs = tf.tensor2d(
        bootstrapIndices.map(idx => featureNames.map(name => features[idx]?.[name] || 0))
      );
      const bootstrapYs = tf.tensor2d(
        bootstrapIndices.map(idx => [labels[idx]])
      );

      await model.fit(bootstrapXs, bootstrapYs, {
        epochs: 50,
        batchSize: Math.min(32, bootstrapIndices.length),
        validationSplit: 0.2,
        verbose: 0
      });

      // Cleanup tensors
      bootstrapXs.dispose();
      bootstrapYs.dispose();

      if (i % 3 === 0) {
        console.log(`Tree ${i + 1}/${this.trees.length} trained`);
      }
    }

    xs.dispose();
    ys.dispose();

    this.isTrained = true;
    this.trainingDate = new Date();
    console.log('Random Forest trained successfully');
    return this;
  }

  /**
   * Bootstrap sampling for bagging
   */
  _bootstrapSample(n) {
    const indices = [];
    for (let i = 0; i < n; i++) {
      indices.push(Math.floor(Math.random() * n));
    }
    return indices;
  }

  /**
   * Predict using ensemble averaging
   */
  predict(features) {
    if (!this.isTrained || this.featureNames.length === 0) {
      return this._defaultPrediction();
    }

    const featureNames = this.featureNames;
    
    // Ensure all feature values are numbers
    const featureValues = featureNames.map(name => {
      const value = features[name];
      if (value === undefined || value === null) return 0;
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    });

    // Average predictions from all trees
    let sumPrediction = 0;
    
    for (const model of this.trees) {
      const subsetInput = tf.tensor2d([featureValues]);
      const prediction = model.predict(subsetInput);
      sumPrediction += prediction.dataSync()[0];
      subsetInput.dispose();
      prediction.dispose();
    }

    const avgPrediction = sumPrediction / this.trees.length;

    // Denormalize to 0-3 range
    const riskLevel = avgPrediction * 3;
    const clampedRisk = Math.max(0, Math.min(3, riskLevel));

    return {
      riskLevel: Math.round(clampedRisk),
      riskLevelLabel: this._getRiskLabel(clampedRisk),
      confidence: 0.85,
      modelType: 'random_forest',
      rawScore: clampedRisk
    };
  }

  _defaultPrediction() {
    return {
      riskLevel: 1,
      riskLevelLabel: 'medium',
      confidence: 0.5,
      modelType: 'random_forest',
      rawScore: 1
    };
  }

  _getRiskLabel(riskLevel) {
    if (riskLevel < 0.5) return 'low';
    if (riskLevel < 1.5) return 'medium';
    if (riskLevel < 2.5) return 'high';
    return 'critical';
  }

  getMetrics() {
    return {
      isTrained: this.isTrained,
      trainingDate: this.trainingDate,
      modelType: this.modelType,
      numTrees: this.numTrees,
      maxDepth: this.maxDepth
    };
  }
}

/**
 * Gradient Boosting Model using TensorFlow.js
 * Implements sequential ensemble with residual fitting
 */
class GradientBoostingModel {
  constructor(options = {}) {
    this.nEstimators = options.nEstimators || 20;
    this.learningRate = options.learningRate || 0.1;
    this.maxDepth = options.maxDepth || 3;
    this.minSamplesSplit = options.minSamplesSplit || 5;
    this.models = [];
    this.initialPrediction = null;
    this.isTrained = false;
    this.featureNames = [];
    this.featureStats = {};
    this.trainingDate = null;
    this.modelType = 'gradient_boosting';
  }

  /**
   * Train the Gradient Boosting model
   */
  async train(trainingData) {
    console.log(`Training Gradient Boosting with ${this.nEstimators} estimators...`);

    if (!trainingData || trainingData.length < 10) {
      console.log('Insufficient training data, using default model');
      this.isTrained = true;
      return this;
    }

    // Prepare features
    const { features, stats } = dataPreprocessor.prepareFeatures(trainingData);
    this.featureStats = stats;
    this.featureNames = Object.keys(features[0] || {});

    // Prepare labels (0-3 range)
    const labels = trainingData
      .map(d => d.labels?.['horizon_24h'])
      .filter(l => l !== undefined);

    if (labels.length < 10) {
      console.log('Insufficient labels, using default model');
      this.isTrained = true;
      return this;
    }

    // Initialize with mean prediction
    this.initialPrediction = labels.reduce((a, b) => a + b, 0) / labels.length;
    
    // Current predictions (starting with initial prediction)
    let currentPredictions = new Array(labels.length).fill(this.initialPrediction);
    
    // Convert to tensors
    const xs = tf.tensor2d(features.map(f => this.featureNames.map(name => f[name] || 0)));

    // Train sequential boosting stages
    for (let i = 0; i < this.nEstimators; i++) {
      // Compute residuals (negative gradient)
      const residuals = labels.map((label, idx) => label - currentPredictions[idx]);

      // Create a simple model to fit residuals
      const model = tf.sequential();
      model.add(tf.layers.dense({
        inputShape: [this.featureNames.length],
        units: 16,
        activation: 'relu'
      }));
      model.add(tf.layers.dense({
        units: 8,
        activation: 'relu'
      }));
      model.add(tf.layers.dense({
        units: 1
      }));

      model.compile({
        optimizer: tf.train.adam(0.05),
        loss: 'meanSquaredError'
      });

      // Fit model to residuals
      const ys = tf.tensor2d(residuals.map(r => [r]));
      
      await model.fit(xs, ys, {
        epochs: 30,
        batchSize: Math.min(32, labels.length),
        verbose: 0
      });

      // Update predictions
      const predictions = model.predict(xs);
      const predArray = predictions.dataSync();
      
      for (let j = 0; j < currentPredictions.length; j++) {
        currentPredictions[j] += this.learningRate * predArray[j];
      }

      this.models.push(model);
      
      ys.dispose();
      predictions.dispose();

      if (i % 5 === 0) {
        console.log(`Boosting stage ${i + 1}/${this.nEstimators} trained`);
      }
    }

    xs.dispose();

    this.isTrained = true;
    this.trainingDate = new Date();
    console.log('Gradient Boosting trained successfully');
    return this;
  }

  /**
   * Predict using boosted ensemble
   */
  predict(features) {
    if (!this.isTrained || this.featureNames.length === 0) {
      return this._defaultPrediction();
    }

    const featureNames = this.featureNames;
    
    // Ensure all feature values are numbers
    const featureValues = featureNames.map(name => {
      const value = features[name];
      if (value === undefined || value === null) return 0;
      const num = Number(value);
      return isNaN(num) ? 0 : num;
    });

    const inputTensor = tf.tensor2d([featureValues]);

    // Start with initial prediction
    let prediction = this.initialPrediction || 1.5;

    // Add contributions from each boosting stage
    for (const model of this.models) {
      const stagePred = model.predict(inputTensor);
      prediction += this.learningRate * stagePred.dataSync()[0];
      stagePred.dispose();
    }

    inputTensor.dispose();

    // Clamp to 0-3 range
    const riskLevel = Math.max(0, Math.min(3, prediction));

    return {
      riskLevel: Math.round(riskLevel),
      riskLevelLabel: this._getRiskLabel(riskLevel),
      confidence: 0.88,
      modelType: 'gradient_boosting',
      rawScore: riskLevel
    };
  }

  _defaultPrediction() {
    return {
      riskLevel: 1,
      riskLevelLabel: 'medium',
      confidence: 0.5,
      modelType: 'gradient_boosting',
      rawScore: 1
    };
  }

  _getRiskLabel(riskLevel) {
    if (riskLevel < 0.5) return 'low';
    if (riskLevel < 1.5) return 'medium';
    if (riskLevel < 2.5) return 'high';
    return 'critical';
  }

  getMetrics() {
    return {
      isTrained: this.isTrained,
      trainingDate: this.trainingDate,
      modelType: this.modelType,
      nEstimators: this.nEstimators,
      learningRate: this.learningRate
    };
  }
}

/**
 * LSTM/GRU Time-Series Forecasting Model using TensorFlow.js
 */
class TimeSeriesForecastModel {
  constructor(options = {}) {
    this.modelType = 'lstm_gru_forecast';
    this.sequenceLength = options.sequenceLength || 24; // Hours of historical data
    this.horizon = options.horizon || 6; // Hours to forecast
    this.useGRU = options.useGRU || false; // Use GRU instead of LSTM
    this.hiddenUnits = options.hiddenUnits || 64;
    this.lstmLayers = options.lstmLayers || 2;
    
    this.model = null;
    this.isTrained = false;
    this.scaler = { mean: 0, std: 1 };
    this.trainingDate = null;
    this.featureStats = {};
  }

  /**
   * Build the LSTM/GRU model architecture
   */
  _buildModel(inputShape) {
    const model = tf.sequential();

    // First LSTM/GRU layer
    if (this.useGRU) {
      model.add(tf.layers.gru({
        units: this.hiddenUnits,
        returnSequences: this.lstmLayers > 1,
        inputShape
      }));
    } else {
      model.add(tf.layers.lstm({
        units: this.hiddenUnits,
        returnSequences: this.lstmLayers > 1,
        inputShape
      }));
    }

    // Additional LSTM/GRU layers
    for (let i = 1; i < this.lstmLayers; i++) {
      if (this.useGRU) {
        model.add(tf.layers.gru({
          units: this.hiddenUnits / (i + 1),
          returnSequences: i < this.lstmLayers - 1
        }));
      } else {
        model.add(tf.layers.lstm({
          units: this.hiddenUnits / (i + 1),
          returnSequences: i < this.lstmLayers - 1
        }));
      }
    }

    // Dropout for regularization
    model.add(tf.layers.dropout({ rate: 0.2 }));

    // Output layer
    model.add(tf.layers.dense({
      units: this.horizon, // Predict next N hours
      activation: 'linear'
    }));

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });

    return model;
  }

  /**
   * Create sequences for time-series training
   */
  _createSequences(data, sequenceLength) {
    const sequences = [];
    const targets = [];

    for (let i = 0; i < data.length - sequenceLength - this.horizon + 1; i++) {
      sequences.push(data.slice(i, i + sequenceLength));
      targets.push(data.slice(i + sequenceLength, i + sequenceLength + this.horizon));
    }

    return { sequences, targets };
  }

  /**
   * Normalize data
   */
  _normalize(data) {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(
      data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length
    ) || 1;

    this.scaler = { mean, std };
    return data.map(val => (val - mean) / std);
  }

  /**
   * Denormalize predictions
   */
  _denormalize(predictions) {
    return predictions.map(val => val * this.scaler.std + this.scaler.mean);
  }

  /**
   * Train the time-series forecasting model
   */
  async train(timeSeriesData) {
    const modelType = this.useGRU ? 'GRU' : 'LSTM';
    console.log(`Training ${modelType} time-series forecasting model...`);

    if (!timeSeriesData || timeSeriesData.length < this.sequenceLength + this.horizon) {
      console.log('Insufficient time-series data, using default model');
      this.isTrained = true;
      return this;
    }

    // Extract risk values from time series
    const riskValues = timeSeriesData.map(d => d.riskMean || d.risk || 0);

    // Calculate feature statistics
    this.featureStats = {
      min: Math.min(...riskValues),
      max: Math.max(...riskValues),
      mean: riskValues.reduce((a, b) => a + b, 0) / riskValues.length,
      std: this._calculateStd(riskValues)
    };

    // Normalize the data
    const normalizedData = this._normalize(riskValues);

    // Create sequences
    const { sequences, targets } = this._createSequences(normalizedData, this.sequenceLength);

    if (sequences.length < 5) {
      console.log('Insufficient sequences for training');
      this.isTrained = true;
      return this;
    }

    // Convert to tensors [samples, sequenceLength, features]
    const xs = tf.tensor3d(sequences.map(seq => seq.map(val => [val])));
    const ys = tf.tensor2d(targets);

    // Build and train model
    this.model = this._buildModel([this.sequenceLength, 1]);

    await this.model.fit(xs, ys, {
      epochs: 50,
      batchSize: Math.min(32, sequences.length),
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0) {
            console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, val_loss = ${logs.val_loss?.toFixed(4) || 'N/A'}`);
          }
        }
      }
    });

    // Cleanup
    xs.dispose();
    ys.dispose();

    this.isTrained = true;
    this.trainingDate = new Date();
    console.log(`${modelType} time-series model trained successfully`);
    return this;
  }

  _calculateStd(values) {
    if (values.length === 0) return 1;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
    ) || 1;
  }

  /**
   * Forecast future risk levels
   */
  forecast(historicalData, horizon = null) {
    const forecastHorizon = horizon || this.horizon;
    
    if (!this.isTrained || !this.model) {
      return this._defaultForecast(forecastHorizon);
    }

    // Extract recent risk values
    const recentRisks = historicalData.slice(-this.sequenceLength).map(d => d.riskMean || d.risk || 0);
    
    if (recentRisks.length < this.sequenceLength) {
      // Pad with mean if not enough data
      const mean = this.featureStats.mean || 1;
      while (recentRisks.length < this.sequenceLength) {
        recentRisks.unshift(mean);
      }
    }

    // Normalize
    const normalized = recentRisks.map(val => (val - this.scaler.mean) / this.scaler.std);

    // Create input sequence
    const inputTensor = tf.tensor3d([[normalized.map(val => [val])]]);

    // Predict
    const prediction = this.model.predict(inputTensor);
    const predArray = prediction.dataSync();

    inputTensor.dispose();
    prediction.dispose();

    // Denormalize and create forecast array
    const forecastValues = this._denormalize(Array.from(predArray));

    // Build forecast result
    const now = new Date();
    const forecasts = forecastValues.slice(0, forecastHorizon).map((value, idx) => {
      const forecastTime = new Date(now.getTime() + (idx + 1) * 60 * 60 * 1000); // Hourly
      const clampedValue = Math.max(0, Math.min(3, value));
      
      return {
        timestamp: forecastTime.toISOString(),
        hour: forecastTime.getHours(),
        predictedRisk: clampedValue,
        riskLevel: Math.round(clampedValue),
        riskLevelLabel: this._getRiskLabel(clampedValue)
      };
    });

    // Calculate trend
    const trend = this._calculateTrend(forecasts.map(f => f.predictedRisk));

    return {
      forecasts,
      horizon: forecastHorizon,
      trend,
      trendLabel: trend > 0.1 ? 'increasing' : trend < -0.1 ? 'decreasing' : 'stable',
      modelType: this.useGRU ? 'GRU' : 'LSTM',
      confidence: 0.82,
      generatedAt: new Date().toISOString()
    };
  }

  _calculateTrend(values) {
    if (values.length < 2) return 0;
    const first = values[0];
    const last = values[values.length - 1];
    return (last - first) / (values.length || 1);
  }

  _defaultForecast(horizon) {
    const now = new Date();
    const forecasts = [];
    for (let i = 0; i < horizon; i++) {
      forecasts.push({
        timestamp: new Date(now.getTime() + (i + 1) * 60 * 60 * 1000).toISOString(),
        predictedRisk: 1,
        riskLevel: 1,
        riskLevelLabel: 'medium'
      });
    }
    return {
      forecasts,
      horizon,
      trend: 0,
      trendLabel: 'stable',
      modelType: this.useGRU ? 'GRU' : 'LSTM',
      confidence: 0.5,
      generatedAt: new Date().toISOString()
    };
  }

  _getRiskLabel(riskLevel) {
    if (riskLevel < 0.5) return 'low';
    if (riskLevel < 1.5) return 'medium';
    if (riskLevel < 2.5) return 'high';
    return 'critical';
  }

  getMetrics() {
    return {
      isTrained: this.isTrained,
      trainingDate: this.trainingDate,
      modelType: this.modelType,
      architecture: this.useGRU ? 'GRU' : 'LSTM',
      sequenceLength: this.sequenceLength,
      horizon: this.horizon,
      hiddenUnits: this.hiddenUnits,
      layers: this.lstmLayers
    };
  }
}

/**
 * Ensemble Risk Prediction Model
 * Combines Random Forest, Gradient Boosting, and LSTM for robust predictions
 */
class RiskPredictionModel {
  constructor(options = {}) {
    this.modelType = 'ensemble_risk';
    this.useGRU = options.useGRU || false;
    
    // Initialize component models
    this.randomForest = new RandomForestModel({
      numTrees: options.rfTrees || 10,
      maxDepth: options.rfDepth || 5
    });
    
    this.gradientBoosting = new GradientBoostingModel({
      nEstimators: options.gbEstimators || 20,
      learningRate: options.gbLearningRate || 0.1
    });
    
    this.timeSeriesModel = new TimeSeriesForecastModel({
      sequenceLength: options.sequenceLength || 24,
      horizon: options.forecastHorizon || 6,
      useGRU: this.useGRU
    });

    this.isTrained = false;
    this.trainingDate = null;
    this.config = options;
  }

  /**
   * Train all component models
   */
  async train(trainingData, timeSeriesData = null) {
    console.log('Training ensemble risk prediction model...');

    // Train Random Forest
    await this.randomForest.train(trainingData);

    // Train Gradient Boosting
    await this.gradientBoosting.train(trainingData);

    // Train Time-Series model if data available
    if (timeSeriesData && timeSeriesData.length > 24) {
      await this.timeSeriesModel.train(timeSeriesData);
    }

    this.isTrained = true;
    this.trainingDate = new Date();
    console.log('Ensemble model trained successfully');
    return this;
  }

  /**
   * Predict risk using ensemble voting
   */
  predict(features, historicalData = null) {
    // Get predictions from each model
    const rfPrediction = this.randomForest.predict(features);
    const gbPrediction = this.gradientBoosting.predict(features);

    // Weighted average ensemble
    const weights = { rf: 0.4, gb: 0.4, ts: 0.2 };
    
    let ensembleScore = 
      rfPrediction.rawScore * weights.rf + 
      gbPrediction.rawScore * weights.gb;

    // Include time-series forecast if available
    if (historicalData && historicalData.length > 0 && this.timeSeriesModel.isTrained) {
      const tsForecast = this.timeSeriesModel.forecast(historicalData, 1);
      if (tsForecast.forecasts.length > 0) {
        ensembleScore += tsForecast.forecasts[0].predictedRisk * weights.ts;
      }
    }

    const riskLevel = Math.max(0, Math.min(3, ensembleScore));

    return {
      riskLevel: Math.round(riskLevel),
      riskLevelLabel: this._getRiskLabel(riskLevel),
      confidence: (rfPrediction.confidence + gbPrediction.confidence) / 2,
      modelType: 'ensemble',
      components: {
        randomForest: rfPrediction,
        gradientBoosting: gbPrediction
      },
      rawScore: riskLevel
    };
  }

  /**
   * Generate time-series forecast
   */
  forecast(historicalData, horizon = 6) {
    return this.timeSeriesModel.forecast(historicalData, horizon);
  }

  _getRiskLabel(riskLevel) {
    if (riskLevel < 0.5) return 'low';
    if (riskLevel < 1.5) return 'medium';
    if (riskLevel < 2.5) return 'high';
    return 'critical';
  }

  getMetrics() {
    return {
      isTrained: this.isTrained,
      trainingDate: this.trainingDate,
      modelType: this.modelType,
      useGRU: this.useGRU,
      components: {
        randomForest: this.randomForest.getMetrics(),
        gradientBoosting: this.gradientBoosting.getMetrics(),
        timeSeries: this.timeSeriesModel.getMetrics()
      }
    };
  }
}

/**
 * Anomaly Detection Model (unchanged from original)
 */
class AnomalyDetectionModel {
  constructor() {
    this.modelType = 'anomaly_detection';
    this.isTrained = false;
    this.baseline = {};
    this.thresholds = {
      zScore: 2.5,
      riskChange: 0.3,
      conjunctionChange: 2
    };
    this.trainingData = [];
    this.baselineStats = {};
  }

  async train(satelliteBehavioralData) {
    console.log('Training anomaly detection model...');
    
    if (!satelliteBehavioralData || satelliteBehavioralData.length < 7) {
      console.log('Insufficient training data for anomaly detection');
      this.isTrained = true;
      return this;
    }

    this.trainingData = satelliteBehavioralData;
    
    const riskValues = satelliteBehavioralData.map(d => d.riskMean || 0);
    const conjunctionValues = satelliteBehavioralData.map(d => d.conjunctionCount || 0);
    const riskTrendValues = satelliteBehavioralData.map(d => d.riskTrend || 0);
    
    this.baselineStats = {
      riskMean: this._mean(riskValues),
      riskStd: this._std(riskValues, this._mean(riskValues)),
      conjunctionMean: this._mean(conjunctionValues),
      conjunctionStd: this._std(conjunctionValues, this._mean(conjunctionValues)),
      riskTrendMean: this._mean(riskTrendValues),
      riskTrendStd: this._std(riskTrendValues, this._mean(riskTrendValues))
    };

    this.thresholds.zScore = Math.max(2.0, Math.min(3.5, 2 + (this.baselineStats.riskStd * 0.5)));
    
    this.isTrained = true;
    this.trainingDate = new Date();
    
    console.log('Anomaly detection model trained successfully');
    return this;
  }

  detect(currentData, historicalData = []) {
    if (!this.isTrained) {
      this.thresholds.zScore = 2.5;
    }

    const anomalies = [];
    const severityScores = [];

    if (currentData.riskMean !== undefined) {
      const zScore = this._zScore(currentData.riskMean, 
        this.baselineStats.riskMean || currentData.riskMean,
        this.baselineStats.riskStd || 0.1);
      
      if (Math.abs(zScore) > this.thresholds.zScore) {
        anomalies.push({
          type: 'risk_anomaly',
          description: `Unusual risk level detected (z-score: ${zScore.toFixed(2)})`,
          severity: Math.abs(zScore) > 3 ? 'high' : 'medium',
          value: currentData.riskMean,
          expectedValue: this.baselineStats.riskMean,
          deviation: zScore
        });
        severityScores.push(Math.min(1, Math.abs(zScore) / 4));
      }
    }

    if (currentData.riskTrend !== undefined) {
      const trendThreshold = this.baselineStats.riskTrendStd 
        ? this.baselineStats.riskTrendStd * this.thresholds.zScore 
        : this.thresholds.riskChange;
      
      if (Math.abs(currentData.riskTrend) > trendThreshold) {
        anomalies.push({
          type: 'risk_trend_anomaly',
          description: `Rapid risk trend change detected (${(currentData.riskTrend * 100).toFixed(1)}%)`,
          severity: Math.abs(currentData.riskTrend) > 0.2 ? 'high' : 'medium',
          value: currentData.riskTrend,
          expectedValue: 0,
          threshold: trendThreshold
        });
        severityScores.push(Math.min(1, Math.abs(currentData.riskTrend) * 3));
      }
    }

    if (currentData.conjunctionCount !== undefined) {
      const expectedConjunctions = this.baselineStats.conjunctionMean || 1;
      const threshold = Math.max(2, expectedConjunctions + this.thresholds.conjunctionChange);
      
      if (currentData.conjunctionCount > threshold) {
        anomalies.push({
          type: 'conjunction_spike',
          description: `Unusual number of conjunctions (${currentData.conjunctionCount} vs expected ~${expectedConjunctions.toFixed(0)})`,
          severity: currentData.conjunctionCount > threshold * 2 ? 'high' : 'medium',
          value: currentData.conjunctionCount,
          expectedValue: expectedConjunctions
        });
        severityScores.push(Math.min(1, currentData.conjunctionCount / (threshold * 3)));
      }
    }

    if (currentData.highRiskConjunctions > 0) {
      const severity = currentData.highRiskConjunctions >= 3 ? 'high' : 'medium';
      anomalies.push({
        type: 'high_risk_conjunctions',
        description: `${currentData.highRiskConjunctions} high-risk conjunction(s) detected`,
        severity,
        value: currentData.highRiskConjunctions,
        expectedValue: 0
      });
      severityScores.push(currentData.highRiskConjunctions / 5);
    }

    if (currentData.maxProbability > 0) {
      let severity = 'low';
      let description = `Elevated collision probability: ${currentData.maxProbability.toExponential(2)}`;
      
      if (currentData.maxProbability > 1e-4) {
        severity = 'high';
        description = `CRITICAL: High collision probability: ${currentData.maxProbability.toExponential(2)}`;
      } else if (currentData.maxProbability > 1e-5) {
        severity = 'medium';
      }
      
      anomalies.push({
        type: 'collision_probability',
        description,
        severity,
        value: currentData.maxProbability,
        expectedValue: 0
      });
      severityScores.push(Math.min(1, currentData.maxProbability * 1e5));
    }

    if (historicalData.length >= 3) {
      const recentMean = historicalData.slice(-3).reduce((a, d) => a + (d.riskMean || 0), 0) / 3;
      const currentRisk = currentData.riskMean || 0;
      const drift = Math.abs(currentRisk - recentMean);
      
      if (drift > this.thresholds.riskChange) {
        anomalies.push({
          type: 'behavioral_drift',
          description: `Behavioral pattern changed significantly (${(drift * 100).toFixed(1)}% drift)`,
          severity: drift > 0.3 ? 'high' : 'medium',
          value: drift,
          expectedValue: 0
        });
        severityScores.push(Math.min(1, drift * 2));
      }
    }

    const overallScore = severityScores.length > 0 
      ? severityScores.reduce((a, b) => a + b, 0) / severityScores.length 
      : 0;

    return {
      hasAnomaly: anomalies.length > 0,
      anomalyCount: anomalies.length,
      anomalyScore: overallScore,
      severity: overallScore > 0.7 ? 'critical' : overallScore > 0.4 ? 'high' : overallScore > 0.2 ? 'medium' : 'low',
      anomalies,
      baseline: this.baselineStats,
      thresholds: this.thresholds,
      analyzedAt: new Date()
    };
  }

  _zScore(value, mean, std) {
    if (std === 0) return 0;
    return (value - mean) / std;
  }

  _mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  _std(values, mean) {
    if (values.length <= 1) return 0.1;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  getMetrics() {
    return {
      isTrained: this.isTrained,
      trainingDate: this.trainingDate,
      modelType: this.modelType,
      baselineStats: this.baselineStats,
      thresholds: this.thresholds
    };
  }
}

// Export model classes
module.exports = {
  RiskPredictionModel,
  AnomalyDetectionModel,
  RandomForestModel,
  GradientBoostingModel,
  TimeSeriesForecastModel
};
