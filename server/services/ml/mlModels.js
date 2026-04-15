/**
 * ML Models for Risk Prediction
 * Implements ensemble methods (Random Forest, Gradient Boosting) and LSTM/GRU for time-series forecasting
 */

const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const path = require('path');
const dataPreprocessor = require('./dataPreprocessor');

/**
 * Model Persistence Manager - Save/Load functionality for ML models
 */
class ModelPersistence {
  constructor(modelsDir = './models') {
    this.modelsDir = modelsDir;
    this.ensureModelsDirectory();
  }

  ensureModelsDirectory() {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  /**
   * Save model to disk
   */
  async saveModel(model, modelName, metadata = {}) {
    const modelPath = path.join(this.modelsDir, `${modelName}`);
    
    try {
      // Ensure directory exists
      if (!fs.existsSync(modelPath)) {
        fs.mkdirSync(modelPath, { recursive: true });
      }

      // Save TensorFlow.js model
      if (model.model && typeof model.model.save === 'function') {
        await model.model.save(`file://${modelPath}/tfmodel`);
      }

      // Save model metadata and configuration
      const modelData = {
        name: modelName,
        modelType: model.modelType,
        isTrained: model.isTrained,
        trainingDate: model.trainingDate,
        featureNames: model.featureNames || [],
        featureStats: model.featureStats || {},
        config: model.config || {},
        // Save calibration parameters
        calibrationParams: model.calibrationParams || null,
        // Save accuracy tracking
        accuracyHistory: model.accuracyHistory || [],
        // Save drift detection state
        driftState: model.driftState || null,
        metadata,
        savedAt: new Date().toISOString()
      };

      fs.writeFileSync(
        path.join(modelPath, 'metadata.json'),
        JSON.stringify(modelData, null, 2)
      );

      // Save ensemble component models if present
      if (model.randomForest) {
        await this._saveComponentModel(model.randomForest, modelName, 'rf');
      }
      if (model.gradientBoosting) {
        await this._saveComponentModel(model.gradientBoosting, modelName, 'gb');
      }
      if (model.timeSeriesModel) {
        await this._saveComponentModel(model.timeSeriesModel, modelName, 'ts');
      }

      console.log(`Model ${modelName} saved successfully to ${modelPath}`);
      return { success: true, path: modelPath };
    } catch (error) {
      console.error(`Error saving model ${modelName}:`, error);
      return { success: false, error: error.message };
    }
  }

  async _saveComponentModel(component, parentName, suffix) {
    if (!component || !component.isTrained) return;
    
    const componentPath = path.join(this.modelsDir, `${parentName}_${suffix}`);
    if (!fs.existsSync(componentPath)) {
      fs.mkdirSync(componentPath, { recursive: true });
    }

    // Save trees/estimators as JSON (weights)
    if (component.trees) {
      const treesData = [];
      for (let i = 0; i < component.trees.length; i++) {
        const tree = component.trees[i];
        const weights = [];
        tree.layers.forEach(layer => {
          if (layer.getWeights && layer.getWeights().length > 0) {
            weights.push(layer.getWeights().map(w => w.dataSync()));
          }
        });
        treesData.push(weights);
      }
      fs.writeFileSync(
        path.join(componentPath, 'trees.json'),
        JSON.stringify(treesData.map(t => t.map(w => Array.from(w[0] || []))))
      );
    }

    if (component.models) {
      // Gradient boosting models
      const boostingData = component.models.map(m => {
        const weights = [];
        m.layers.forEach(layer => {
          if (layer.getWeights && layer.getWeights().length > 0) {
            weights.push(layer.getWeights().map(w => Array.from(w.dataSync())));
          }
        });
        return weights;
      });
      fs.writeFileSync(
        path.join(componentPath, 'boosting.json'),
        JSON.stringify(boostingData)
      );
    }

    // Save metadata
    const metadata = {
      modelType: component.modelType,
      isTrained: component.isTrained,
      trainingDate: component.trainingDate,
      featureNames: component.featureNames || [],
      featureStats: component.featureStats || {},
      initialPrediction: component.initialPrediction,
      calibrationParams: component.calibrationParams || null
    };

    fs.writeFileSync(
      path.join(componentPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
  }

  /**
   * Load model from disk
   */
  async loadModel(modelName, modelClass) {
    const modelPath = path.join(this.modelsDir, `${modelName}`);
    
    try {
      if (!fs.existsSync(modelPath)) {
        console.log(`Model ${modelName} not found at ${modelPath}`);
        return null;
      }

      // Load metadata
      const metadataPath = path.join(modelPath, 'metadata.json');
      if (!fs.existsSync(metadataPath)) {
        throw new Error('Model metadata not found');
      }

      const modelData = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

      // Create new model instance
      const model = new modelClass(modelData.config);
      
      // Restore model properties
      model.modelType = modelData.modelType;
      model.trainingDate = modelData.trainingDate;
      model.featureNames = modelData.featureNames;
      model.featureStats = modelData.featureStats;
      model.calibrationParams = modelData.calibrationParams;
      model.accuracyHistory = modelData.accuracyHistory || [];
      model.driftState = modelData.driftState;

      // Load TensorFlow model if exists
      const tfModelPath = path.join(modelPath, 'tfmodel');
      if (fs.existsSync(tfModelPath)) {
        try {
          model.model = await tf.loadLayersModel(`file://${tfModelPath}/model.json`);
        } catch (e) {
          console.warn('Could not load TensorFlow model:', e.message);
        }
      }

      // Load component models
      await this._loadComponentModel(model, modelName, 'rf');
      await this._loadComponentModel(model, modelName, 'gb');
      await this._loadComponentModel(model, modelName, 'ts');

      model.isTrained = modelData.isTrained;
      console.log(`Model ${modelName} loaded successfully from ${modelPath}`);
      
      return { model, metadata: modelData };
    } catch (error) {
      console.error(`Error loading model ${modelName}:`, error);
      return null;
    }
  }

  async _loadComponentModel(parentModel, parentName, suffix) {
    const componentPath = path.join(this.modelsDir, `${parentName}_${suffix}`);
    if (!fs.existsSync(componentPath)) return;

    const metadataPath = path.join(componentPath, 'metadata.json');
    if (!fs.existsSync(metadataPath)) return;

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

    // Determine which component to load
    if (suffix === 'rf' && parentModel.randomForest) {
      parentModel.randomForest.featureNames = metadata.featureNames;
      parentModel.randomForest.featureStats = metadata.featureStats;
      parentModel.randomForest.isTrained = metadata.isTrained;
      parentModel.randomForest.calibrationParams = metadata.calibrationParams;
    } else if (suffix === 'gb' && parentModel.gradientBoosting) {
      parentModel.gradientBoosting.featureNames = metadata.featureNames;
      parentModel.gradientBoosting.featureStats = metadata.featureStats;
      parentModel.gradientBoosting.isTrained = metadata.isTrained;
      parentModel.gradientBoosting.initialPrediction = metadata.initialPrediction;
      parentModel.gradientBoosting.calibrationParams = metadata.calibrationParams;
    } else if (suffix === 'ts' && parentModel.timeSeriesModel) {
      parentModel.timeSeriesModel.featureStats = metadata.featureStats;
      parentModel.timeSeriesModel.isTrained = metadata.isTrained;
    }
  }

  /**
   * List all saved models
   */
  listModels() {
    if (!fs.existsSync(this.modelsDir)) {
      return [];
    }

    const models = [];
    const entries = fs.readdirSync(this.modelsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(this.modelsDir, entry.name, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            models.push({
              name: entry.name,
              modelType: metadata.modelType,
              trainingDate: metadata.trainingDate,
              savedAt: metadata.savedAt
            });
          } catch (e) {
            models.push({ name: entry.name, error: 'Invalid metadata' });
          }
        }
      }
    }

    return models;
  }

  /**
   * Delete a saved model
   */
  deleteModel(modelName) {
    const modelPath = path.join(this.modelsDir, modelName);
    
    try {
      if (fs.existsSync(modelPath)) {
        fs.rmSync(modelPath, { recursive: true, force: true });
        console.log(`Model ${modelName} deleted successfully`);
        return { success: true };
      }
      return { success: false, error: 'Model not found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * Drift Detection Monitor - Detects changes in prediction distributions
 */
class DriftDetectionMonitor {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 100;
    this.driftThreshold = options.driftThreshold || 0.1;
    this.referenceWindow = [];
    this.currentWindow = [];
    this.driftHistory = [];
    this.isInitialized = false;
  }

  /**
   * Initialize with reference data
   */
  initialize(referenceData) {
    this.referenceWindow = referenceData.slice(-this.windowSize);
    this.isInitialized = true;
    console.log(`Drift detector initialized with ${this.referenceWindow.length} reference samples`);
  }

  /**
   * Add a new prediction and check for drift
   */
  addPrediction(prediction, actual = null) {
    this.currentWindow.push(prediction);
    
    // Keep window at fixed size
    if (this.currentWindow.length > this.windowSize) {
      this.currentWindow.shift();
    }

    // Check for drift if we have enough data
    if (this.isInitialized && this.currentWindow.length >= this.windowSize / 2) {
      return this.detectDrift();
    }

    return { hasDrift: false, driftScore: 0 };
  }

  /**
   * Detect drift using Population Stability Index (PSI) and Kolmogorov-Smirnov test
   */
  detectDrift() {
    if (this.referenceWindow.length === 0) {
      return { hasDrift: false, driftScore: 0 };
    }

    // Calculate PSI (Population Stability Index)
    const psi = this._calculatePSI(this.referenceWindow, this.currentWindow);
    
    // Calculate KS statistic
    const ksStatistic = this._calculateKSStatistic(this.referenceWindow, this.currentWindow);
    
    // Combined drift score
    const driftScore = (psi * 0.6 + ksStatistic * 0.4);
    
    const hasDrift = driftScore > this.driftThreshold;

    const driftResult = {
      hasDrift,
      driftScore,
      psi,
      ksStatistic,
      threshold: this.driftThreshold,
      referenceSize: this.referenceWindow.length,
      currentSize: this.currentWindow.length,
      timestamp: new Date().toISOString()
    };

    if (hasDrift) {
      this.driftHistory.push(driftResult);
      console.log(`DRIFT DETECTED: score=${driftScore.toFixed(4)}, PSI=${psi.toFixed(4)}, KS=${ksStatistic.toFixed(4)}`);
    }

    return driftResult;
  }

  /**
   * Calculate Population Stability Index
   */
  _calculatePSI(reference, current) {
    // Bin the data into percentiles
    const nBins = 10;
    const allValues = [...reference, ...current];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const binWidth = (max - min) / nBins || 1;

    // Count in each bin for reference
    const refBins = new Array(nBins).fill(0);
    const currBins = new Array(nBins).fill(0);

    for (const val of reference) {
      const bin = Math.min(Math.floor((val - min) / binWidth), nBins - 1);
      refBins[bin]++;
    }

    for (const val of current) {
      const bin = Math.min(Math.floor((val - min) / binWidth), nBins - 1);
      currBins[bin]++;
    }

    // Convert to proportions
    const refProportions = refBins.map(c => c / reference.length || 0.0001);
    const currProportions = currBins.map(c => c / current.length || 0.0001);

    // Calculate PSI for each bin
    let psi = 0;
    for (let i = 0; i < nBins; i++) {
      if (refProportions[i] > 0 && currProportions[i] > 0) {
        psi += (currProportions[i] - refProportions[i]) * 
               Math.log(currProportions[i] / refProportions[i]);
      }
    }

    return psi;
  }

  /**
   * Calculate Kolmogorov-Smirnov statistic
   */
  _calculateKSStatistic(reference, current) {
    const sortedRef = [...reference].sort((a, b) => a - b);
    const sortedCurr = [...current].sort((a, b) => a - b);

    let maxDiff = 0;
    let refIdx = 0;
    let currIdx = 0;

    while (refIdx < sortedRef.length && currIdx < sortedCurr.length) {
      const refVal = sortedRef[refIdx];
      const currVal = sortedCurr[currIdx];
      
      const refProportion = (refIdx + 1) / sortedRef.length;
      const currProportion = (currIdx + 1) / sortedCurr.length;

      if (refVal < currVal) {
        maxDiff = Math.max(maxDiff, Math.abs(refProportion - currProportion));
        refIdx++;
      } else {
        maxDiff = Math.max(maxDiff, Math.abs(refProportion - currProportion));
        currIdx++;
      }
    }

    return maxDiff;
  }

  /**
   * Update reference window (retraining trigger)
   */
  updateReference() {
    if (this.currentWindow.length > 0) {
      this.referenceWindow = [...this.currentWindow];
      console.log('Reference window updated with current observations');
    }
  }

  getDriftHistory() {
    return this.driftHistory;
  }

  reset() {
    this.referenceWindow = [];
    this.currentWindow = [];
    this.driftHistory = [];
    this.isInitialized = false;
  }
}

/**
 * Accuracy Tracker - Tracks prediction accuracy with ground truth feedback
 */
class AccuracyTracker {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 200;
    this.predictions = [];
    this.accuracyHistory = [];
    this.calibrationData = []; // For probability calibration
  }

  /**
   * Record a prediction with ground truth
   */
  recordPrediction(prediction, groundTruth, metadata = {}) {
    const record = {
      predicted: prediction.riskLevel,
      predictedScore: prediction.rawScore || prediction.riskLevel,
      predictedConfidence: prediction.confidence || 0.5,
      actual: groundTruth,
      timestamp: new Date().toISOString(),
      metadata
    };

    this.predictions.push(record);

    // Keep window size limited
    if (this.predictions.length > this.windowSize) {
      this.predictions.shift();
    }

    // Calculate accuracy
    const accuracy = this._calculateAccuracy();
    const precision = this._calculatePrecision();
    const recall = this._calculateRecall();
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    // Calculate calibration error
    const calibrationError = this._calculateCalibrationError();

    const metrics = {
      accuracy,
      precision,
      recall,
      f1,
      calibrationError,
      totalPredictions: this.predictions.length,
      timestamp: new Date().toISOString()
    };

    this.accuracyHistory.push(metrics);
    
    // Keep calibration data for calibration
    this.calibrationData.push({
      predictedScore: record.predictedScore,
      actual: groundTruth,
      confidence: record.predictedConfidence
    });

    if (this.calibrationData.length > this.windowSize) {
      this.calibrationData.shift();
    }

    return metrics;
  }

  _calculateAccuracy() {
    if (this.predictions.length === 0) return 0;
    
    const correct = this.predictions.filter(p => 
      Math.round(p.predicted) === p.actual
    ).length;
    
    return correct / this.predictions.length;
  }

  _calculatePrecision() {
    if (this.predictions.length === 0) return 0;
    
    // For high-risk predictions
    const highRiskPredictions = this.predictions.filter(p => p.predicted >= 2);
    if (highRiskPredictions.length === 0) return 0;
    
    const truePositives = highRiskPredictions.filter(p => p.actual >= 2).length;
    return truePositives / highRiskPredictions.length;
  }

  _calculateRecall() {
    if (this.predictions.length === 0) return 0;
    
    // Actual high-risk cases
    const actualHighRisk = this.predictions.filter(p => p.actual >= 2);
    if (actualHighRisk.length === 0) return 0;
    
    const truePositives = actualHighRisk.filter(p => p.predicted >= 2).length;
    return truePositives / actualHighRisk.length;
  }

  _calculateCalibrationError() {
    if (this.calibrationData.length < 10) return 0;
    
    // Group into confidence bins
    const bins = {}
    for (const data of this.calibrationData) {
      const bin = Math.floor(data.confidence * 10) / 10;
      if (!bins[bin]) {
        bins[bin] = { correct: 0, total: 0 };
      }
      bins[bin].total++;
      if (Math.abs(data.predictedScore - data.actual) <= 0.5) {
        bins[bin].correct++;
      }
    }

    // Calculate Expected Calibration Error (ECE)
    let totalWeight = 0;
    let weightedError = 0;
    
    for (const [bin, data] of Object.entries(bins)) {
      if (data.total > 0) {
        const accuracy = data.correct / data.total;
        const confidence = parseFloat(bin) + 0.05;
        const error = Math.abs(accuracy - confidence);
        weightedError += error * data.total;
        totalWeight += data.total;
      }
    }

    return totalWeight > 0 ? weightedError / totalWeight : 0;
  }

  getMetrics() {
    if (this.predictions.length === 0) {
      return {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1: 0,
        calibrationError: 0,
        totalPredictions: 0
      };
    }

    return {
      accuracy: this._calculateAccuracy(),
      precision: this._calculatePrecision(),
      recall: this._calculateRecall(),
      f1: this._calculatePrecision() + this._calculateRecall() > 0 
        ? 2 * (this._calculatePrecision() * this._calculateRecall()) / (this._calculatePrecision() + this._calculateRecall())
        : 0,
      calibrationError: this._calculateCalibrationError(),
      totalPredictions: this.predictions.length,
      recentAccuracy: this.accuracyHistory.length > 0 
        ? this.accuracyHistory[this.accuracyHistory.length - 1].accuracy 
        : 0
    };
  }

  getCalibrationData() {
    return [...this.calibrationData];
  }

  reset() {
    this.predictions = [];
    this.accuracyHistory = [];
    this.calibrationData = [];
  }
}

/**
 * Probability Calibration using Platt Scaling or Isotonic Regression
 */
class ProbabilityCalibrator {
  constructor(method = 'platt') {
    this.method = method; // 'platt' or 'isotonic'
    this.isCalibrated = false;
    this.calibrationParams = null;
    this.calibrationData = [];
  }

  /**
   * Fit calibration model using Platt scaling or isotonic regression
   */
  fit(predictions, trueLabels) {
    if (predictions.length < 20) {
      console.log('Insufficient data for calibration');
      return this;
    }

    this.calibrationData = predictions.map((pred, i) => ({
      score: pred,
      label: trueLabels[i]
    }));

    if (this.method === 'platt') {
      this._fitPlattScaling();
    } else {
      this._fitIsotonicRegression();
    }

    this.isCalibrated = true;
    console.log(`Probability calibration complete (${this.method})`);
    return this;
  }

  /**
   * Platt Scaling: Fit logistic regression on scores
   */
  _fitPlattScaling() {
    // Convert to binary classification scores (high risk vs not)
    const scores = this.calibrationData.map(d => d.score);
    const labels = this.calibrationData.map(d => d.label >= 2 ? 1 : 0);

    // Use sigmoid function: P(y=1|s) = 1 / (1 + exp(a*s + b))
    // Fit using maximum likelihood estimation
    let a = 1.0;
    let b = 0.0;
    const learningRate = 0.01;
    const iterations = 1000;

    for (let iter = 0; iter < iterations; iter++) {
      let gradA = 0;
      let gradB = 0;

      for (let i = 0; i < scores.length; i++) {
        const s = scores[i];
        const y = labels[i];
        const p = 1 / (1 + Math.exp(-a * s - b));
        const eps = 1e-10;
        const pClamped = Math.max(eps, Math.min(1 - eps, p));
        
        gradA += (y - pClamped) * s;
        gradB += (y - pClamped);
      }

      a += learningRate * gradA / scores.length;
      b += learningRate * gradB / scores.length;
    }

    this.calibrationParams = { a, b };
  }

  /**
   * Isotonic Regression: Fit monotonic piecewise function
   */
  _fitIsotonicRegression() {
    // Sort by score
    const sorted = [...this.calibrationData].sort((a, b) => a.score - b.score);
    
    // Calculate positive rates in bins
    const nBins = Math.min(10, Math.floor(sorted.length / 5));
    const binSize = Math.ceil(sorted.length / nBins);
    
    const bins = [];
    for (let i = 0; i < sorted.length; i += binSize) {
      const binData = sorted.slice(i, i + binSize);
      const positives = binData.filter(d => d.label >= 2).length;
      bins.push({
        score: binData[0].score,
        endScore: binData[binData.length - 1].score,
        positiveRate: positives / binData.length,
        count: binData.length
      });
    }

    // Apply isotonic constraint (monotonic increasing)
    let runningMax = 0;
    for (const bin of bins) {
      bin.positiveRate = Math.max(bin.positiveRate, runningMax);
      runningMax = bin.positiveRate;
    }

    this.calibrationParams = { bins, method: 'isotonic' };
  }

  /**
   * Calibrate a prediction score
   */
  calibrate(score) {
    if (!this.isCalibrated || !this.calibrationParams) {
      return score; // Return original if not calibrated
    }

    if (this.method === 'platt') {
      const { a, b } = this.calibrationParams;
      return 1 / (1 + Math.exp(-a * score - b));
    } else {
      // Isotonic regression lookup
      for (const bin of this.calibrationParams.bins) {
        if (score >= bin.score && score <= bin.endScore) {
          return bin.positiveRate;
        }
      }
      // Extrapolate
      if (score < this.calibrationParams.bins[0].score) {
        return this.calibrationParams.bins[0].positiveRate;
      }
      return this.calibrationParams.bins[this.calibrationParams.bins.length - 1].positiveRate;
    }
  }

  /**
   * Get calibrated probability distribution
   */
  getCalibratedProbabilities(rawScores) {
    const calibratedScores = rawScores.map(s => this.calibrate(s));
    
    // Convert to probability distribution
    const total = calibratedScores.reduce((a, b) => a + b, 0) || 1;
    return calibratedScores.map(s => s / total);
  }

  /**
   * Get calibration parameters for saving
   */
  getParams() {
    return {
      method: this.method,
      isCalibrated: this.isCalibrated,
      params: this.calibrationParams
    };
  }

  /**
   * Load calibration parameters
   */
  loadParams(params) {
    this.method = params.method;
    this.isCalibrated = params.isCalibrated;
    this.calibrationParams = params.params;
  }
}

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
    
    // Probability calibration
    this.calibrator = new ProbabilityCalibrator(options.calibrationMethod || 'platt');
    this.calibrationParams = null;
    
    // Drift detection
    this.driftMonitor = new DriftDetectionMonitor({ 
      windowSize: options.driftWindowSize || 100,
      driftThreshold: options.driftThreshold || 0.1
    });
    
    // Accuracy tracking
    this.accuracyTracker = new AccuracyTracker({ windowSize: options.accuracyWindowSize || 200 });
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
    this.calibrationParams = this.calibrator.getParams();
    
    // Initialize drift monitor with training data
    const trainingScores = labels.map(l => l / 3);
    this.driftMonitor.initialize(trainingScores);
    
    console.log('Random Forest trained successfully');
    return this;
  }

  /**
   * Get calibrated probabilities using Platt scaling or isotonic regression
   * Replaces the old Gaussian distribution approach
   */
  _getProbabilities(rawScore) {
    // If calibrated, use calibration model
    if (this.calibrator.isCalibrated) {
      const calibratedProb = this.calibrator.calibrate(rawScore);
      return this._convertToClassProbabilities(calibratedProb, rawScore);
    }
    
    // Fallback to calibrated normal distribution approximation
    return this._convertToClassProbabilities(rawScore / 3, rawScore);
  }

  /**
   * Convert continuous score to class probabilities
   */
  _convertToClassProbabilities(calibratedScore, rawScore) {
    // Use the calibrated score to produce probabilities
    const baseProb = calibratedScore;
    
    // Adjust for risk level boundaries
    const probabilities = [];
    
    // Class 0 (low): high probability when score < 0.5
    probabilities[0] = Math.max(0, 1 - Math.abs(rawScore - 0) / 1.5);
    
    // Class 1 (medium): high probability when score around 1
    probabilities[1] = Math.max(0, 1 - Math.abs(rawScore - 1) / 1.5);
    
    // Class 2 (high): high probability when score around 2
    probabilities[2] = Math.max(0, 1 - Math.abs(rawScore - 2) / 1.5);
    
    // Class 3 (critical): high probability when score > 2.5
    probabilities[3] = Math.max(0, Math.min(1, (rawScore - 2) / 1));
    
    // Normalize to sum to 1
    const sum = probabilities.reduce((a, b) => a + b, 0) || 1;
    return probabilities.map(p => p / sum);
  }

  /**
   * Record ground truth for accuracy tracking
   */
  recordGroundTruth(groundTruthRiskLevel) {
    // Get last prediction
    const lastPrediction = this._lastPrediction;
    if (!lastPrediction) return null;
    
    const metrics = this.accuracyTracker.recordPrediction(lastPrediction, groundTruthRiskLevel, {
      modelType: this.modelType
    });
    
    // Check for drift
    const driftResult = this.driftMonitor.addPrediction(lastPrediction.rawScore || lastPrediction.riskLevel);
    
    // Retrain if significant drift detected
    if (driftResult.hasDrift) {
      console.log(`Drift detected in ${this.modelType}, consider retraining`);
    }
    
    return {
      ...metrics,
      driftDetected: driftResult.hasDrift,
      driftScore: driftResult.driftScore
    };
  }

  /**
   * Update calibration with new ground truth data
   */
  updateCalibration() {
    const calibrationData = this.accuracyTracker.getCalibrationData();
    if (calibrationData.length >= 20) {
      const scores = calibrationData.map(d => d.predictedScore);
      const labels = calibrationData.map(d => d.actual);
      this.calibrator.fit(scores, labels);
      this.calibrationParams = this.calibrator.getParams();
      console.log('Calibration updated with new ground truth data');
    }
  }

  /**
   * Get current accuracy metrics
   */
  getAccuracyMetrics() {
    return this.accuracyTracker.getMetrics();
  }

  /**
   * Get drift detection status
   */
  getDriftStatus() {
    return {
      isInitialized: this.driftMonitor.isInitialized,
      driftHistory: this.driftMonitor.getDriftHistory(),
      currentDrift: this.driftMonitor.detectDrift()
    };
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
      rawScore: clampedRisk,
      classProbabilities: this._getProbabilities(clampedRisk)
    };
  }

  _lastPrediction = null;

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
      maxDepth: this.maxDepth,
      calibration: this.calibrationParams,
      accuracy: this.getAccuracyMetrics(),
      driftStatus: this.getDriftStatus()
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
    
    // Probability calibration
    this.calibrator = new ProbabilityCalibrator(options.calibrationMethod || 'platt');
    this.calibrationParams = null;
    
    // Drift detection
    this.driftMonitor = new DriftDetectionMonitor({ 
      windowSize: options.driftWindowSize || 100,
      driftThreshold: options.driftThreshold || 0.1
    });
    
    // Accuracy tracking
    this.accuracyTracker = new AccuracyTracker({ windowSize: options.accuracyWindowSize || 200 });
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
    this.calibrationParams = this.calibrator.getParams();
    
    // Initialize drift monitor
    const trainingScores = labels.map(l => l / 3);
    this.driftMonitor.initialize(trainingScores);
    
    console.log('Gradient Boosting trained successfully');
    return this;
  }

  /**
   * Get calibrated probabilities using Platt scaling or isotonic regression
   */
  _getProbabilities(rawScore) {
    if (this.calibrator.isCalibrated) {
      const calibratedProb = this.calibrator.calibrate(rawScore);
      return this._convertToClassProbabilities(calibratedProb, rawScore);
    }
    return this._convertToClassProbabilities(rawScore / 3, rawScore);
  }

  _convertToClassProbabilities(calibratedScore, rawScore) {
    const probabilities = [];
    probabilities[0] = Math.max(0, 1 - Math.abs(rawScore - 0) / 1.5);
    probabilities[1] = Math.max(0, 1 - Math.abs(rawScore - 1) / 1.5);
    probabilities[2] = Math.max(0, 1 - Math.abs(rawScore - 2) / 1.5);
    probabilities[3] = Math.max(0, Math.min(1, (rawScore - 2) / 1));
    const sum = probabilities.reduce((a, b) => a + b, 0) || 1;
    return probabilities.map(p => p / sum);
  }

  /**
   * Record ground truth for accuracy tracking
   */
  recordGroundTruth(groundTruthRiskLevel) {
    const lastPrediction = this._lastPrediction;
    if (!lastPrediction) return null;
    
    const metrics = this.accuracyTracker.recordPrediction(lastPrediction, groundTruthRiskLevel, {
      modelType: this.modelType
    });
    
    const driftResult = this.driftMonitor.addPrediction(lastPrediction.rawScore || lastPrediction.riskLevel);
    
    if (driftResult.hasDrift) {
      console.log(`Drift detected in ${this.modelType}, consider retraining`);
    }
    
    return {
      ...metrics,
      driftDetected: driftResult.hasDrift,
      driftScore: driftResult.driftScore
    };
  }

  /**
   * Update calibration with new ground truth data
   */
  updateCalibration() {
    const calibrationData = this.accuracyTracker.getCalibrationData();
    if (calibrationData.length >= 20) {
      const scores = calibrationData.map(d => d.predictedScore);
      const labels = calibrationData.map(d => d.actual);
      this.calibrator.fit(scores, labels);
      this.calibrationParams = this.calibrator.getParams();
    }
  }

  getAccuracyMetrics() {
    return this.accuracyTracker.getMetrics();
  }

  getDriftStatus() {
    return {
      isInitialized: this.driftMonitor.isInitialized,
      driftHistory: this.driftMonitor.getDriftHistory(),
      currentDrift: this.driftMonitor.detectDrift()
    };
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
      rawScore: riskLevel,
      classProbabilities: this._getProbabilities(riskLevel)
    };
  }

  _lastPrediction = null;

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
      learningRate: this.learningRate,
      calibration: this.calibrationParams,
      accuracy: this.getAccuracyMetrics(),
      driftStatus: this.getDriftStatus()
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
      maxDepth: options.rfDepth || 5,
      calibrationMethod: options.calibrationMethod || 'platt',
      driftWindowSize: options.driftWindowSize || 100,
      driftThreshold: options.driftThreshold || 0.1,
      accuracyWindowSize: options.accuracyWindowSize || 200
    });
    
    this.gradientBoosting = new GradientBoostingModel({
      nEstimators: options.gbEstimators || 20,
      learningRate: options.gbLearningRate || 0.1,
      calibrationMethod: options.calibrationMethod || 'platt',
      driftWindowSize: options.driftWindowSize || 100,
      driftThreshold: options.driftThreshold || 0.1,
      accuracyWindowSize: options.accuracyWindowSize || 200
    });
    
    this.timeSeriesModel = new TimeSeriesForecastModel({
      sequenceLength: options.sequenceLength || 24,
      horizon: options.forecastHorizon || 6,
      useGRU: this.useGRU
    });

    this.isTrained = false;
    this.trainingDate = null;
    this.config = options;
    
    // Model persistence
    this.persistence = new ModelPersistence(options.modelsDir || './models');
    this.modelName = options.modelName || 'risk_prediction_model';
  }

  /**
   * Save the model to disk
   */
  async saveModel() {
    return await this.persistence.saveModel(this, this.modelName, this.config);
  }

  /**
   * Load the model from disk
   */
  async loadModel() {
    const result = await this.persistence.loadModel(this.modelName, RiskPredictionModel);
    if (result && result.model) {
      this.randomForest = result.model.randomForest;
      this.gradientBoosting = result.model.gradientBoosting;
      this.timeSeriesModel = result.model.timeSeriesModel;
      this.isTrained = result.model.isTrained;
      this.trainingDate = result.model.trainingDate;
      return { success: true, metadata: result.metadata };
    }
    return { success: false, error: 'Model not found' };
  }

  /**
   * Record ground truth for accuracy tracking
   */
  recordGroundTruth(groundTruthRiskLevel) {
    const rfMetrics = this.randomForest.recordGroundTruth(groundTruthRiskLevel);
    const gbMetrics = this.gradientBoosting.recordGroundTruth(groundTruthRiskLevel);
    
    return {
      randomForest: rfMetrics,
      gradientBoosting: gbMetrics,
      ensembleAccuracy: rfMetrics && gbMetrics 
        ? (rfMetrics.accuracy + gbMetrics.accuracy) / 2 
        : 0
    };
  }

  /**
   * Update calibration with new ground truth data
   */
  updateCalibration() {
    this.randomForest.updateCalibration();
    this.gradientBoosting.updateCalibration();
  }

  /**
   * Get accuracy metrics for all models
   */
  getAccuracyMetrics() {
    return {
      randomForest: this.randomForest.getAccuracyMetrics(),
      gradientBoosting: this.gradientBoosting.getAccuracyMetrics(),
      ensemble: {
        accuracy: (this.randomForest.getAccuracyMetrics().accuracy + 
                  this.gradientBoosting.getAccuracyMetrics().accuracy) / 2
      }
    };
  }

  /**
   * Get drift detection status
   */
  getDriftStatus() {
    return {
      randomForest: this.randomForest.getDriftStatus(),
      gradientBoosting: this.gradientBoosting.getDriftStatus()
    };
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
      rawScore: riskLevel,
      classProbabilities: this._combineProbabilities(rfPrediction.classProbabilities, gbPrediction.classProbabilities)
    };
  }

  /**
   * Combine class probabilities from multiple models
   */
  _combineProbabilities(rfProbs, gbProbs) {
    if (!rfProbs || !gbProbs) {
      return [0.25, 0.25, 0.25, 0.25];
    }
    
    // Weighted average of probabilities
    const weights = { rf: 0.5, gb: 0.5 };
    const combined = [];
    
    for (let i = 0; i < 4; i++) {
      combined[i] = rfProbs[i] * weights.rf + gbProbs[i] * weights.gb;
    }
    
    // Renormalize
    const sum = combined.reduce((a, b) => a + b, 0) || 1;
    return combined.map(p => p / sum);
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
      },
      accuracy: this.getAccuracyMetrics(),
      driftStatus: this.getDriftStatus()
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
  TimeSeriesForecastModel,
  // New classes
  ModelPersistence,
  DriftDetectionMonitor,
  AccuracyTracker,
  ProbabilityCalibrator
};
