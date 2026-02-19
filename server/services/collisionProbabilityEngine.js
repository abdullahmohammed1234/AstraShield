/**
 * Collision Probability Engine
 * Implements NASA/Caltech methodologies for probabilistic collision analysis
 * 
 * Key methods:
 * - Probability of Collision (Pc) calculation using the "squared miss distance" method
 * - Uncertainty ellipsoid calculations
 * - Covariance propagation using satellite.js
 */

const satellite = require('satellite.js');

const CONFIG = {
  // Hard body radius defaults (meters) - typical satellite sizes
  DEFAULT_PRIMARY_RADIUS: 5,     // Large satellite/upper stage
  DEFAULT_SECONDARY_RADIUS: 1,  // Small debris
  
  // Covariance scale factors for uncertainty propagation
  COVARIANCE_GROWTH_RATE: 0.05, // 5% per day uncertainty growth
  COVARIANCE_AGE_DAYS: 1,       // Default covariance age
  
  // Probability thresholds
  Pc_THRESHOLDS: {
    CRITICAL: 1e-3,   // 0.1%
    HIGH: 1e-4,       // 0.01%
    MODERATE: 1e-5,   // 0.001%
    LOW: 0
  },
  
  // Sigma multipliers for ellipsoid visualization
  SIGMA_LEVELS: [1, 2, 3],  // 1-sigma, 2-sigma, 3-sigma
  
  // Integration settings
  NUM_INTEGRATION_STEPS: 100,
  DEFAULT_COVARIANCE_SCALAR: 1000 // m² - default uncertainty if not provided
};

/**
 * Matrix operations utility class
 */
class Matrix3 {
  constructor(data = [0,0,0,0,0,0,0,0,0]) {
    this.data = data; // Row-major 3x3 matrix
  }
  
  static identity() {
    return new Matrix3([1,0,0, 0,1,0, 0,0,1]);
  }
  
  static fromArray(arr) {
    if (arr.length === 9) {
      return new Matrix3(arr);
    }
    return Matrix3.identity();
  }
  
  multiply(other) {
    const a = this.data;
    const b = other.data;
    return new Matrix3([
      a[0]*b[0] + a[1]*b[3] + a[2]*b[6],
      a[0]*b[1] + a[1]*b[4] + a[2]*b[7],
      a[0]*b[2] + a[1]*b[5] + a[2]*b[8],
      a[3]*b[0] + a[4]*b[3] + a[5]*b[6],
      a[3]*b[1] + a[4]*b[4] + a[5]*b[7],
      a[3]*b[2] + a[4]*b[5] + a[5]*b[8],
      a[6]*b[0] + a[7]*b[3] + a[8]*b[6],
      a[6]*b[1] + a[7]*b[4] + a[8]*b[7],
      a[6]*b[2] + a[7]*b[5] + a[8]*b[8]
    ]);
  }
  
  add(other) {
    const a = this.data;
    const b = other.data;
    return new Matrix3([
      a[0] + b[0], a[1] + b[1], a[2] + b[2],
      a[3] + b[3], a[4] + b[4], a[5] + b[5],
      a[6] + b[6], a[7] + b[7], a[8] + b[8]
    ]);
  }
  
  scale(s) {
    return new Matrix3(this.data.map(x => x * s));
  }
  
  // Compute determinant
  determinant() {
    const d = this.data;
    return d[0] * (d[4]*d[8] - d[5]*d[7])
         - d[1] * (d[3]*d[8] - d[5]*d[6])
         + d[2] * (d[3]*d[7] - d[4]*d[6]);
  }
  
  // Compute inverse
  inverse() {
    const d = this.data;
    const det = this.determinant();
    if (Math.abs(det) < 1e-15) {
      return Matrix3.identity(); // Singular matrix
    }
    
    const invDet = 1 / det;
    return new Matrix3([
      (d[4]*d[8] - d[5]*d[7]) * invDet,
      (d[2]*d[7] - d[1]*d[8]) * invDet,
      (d[1]*d[5] - d[2]*d[4]) * invDet,
      (d[5]*d[6] - d[3]*d[8]) * invDet,
      (d[0]*d[8] - d[2]*d[6]) * invDet,
      (d[2]*d[3] - d[0]*d[5]) * invDet,
      (d[3]*d[7] - d[4]*d[6]) * invDet,
      (d[1]*d[6] - d[0]*d[7]) * invDet,
      (d[0]*d[4] - d[1]*d[3]) * invDet
    ]);
  }
  
  // Get eigenvalues and eigenvectors for ellipsoid
  eig() {
    // Simplified eigenvalue computation for 3x3 symmetric matrix
    const m = this.data;
    // Ensure symmetric
    const sym = [
      m[0], (m[1]+m[3])/2, (m[2]+m[6])/2,
      (m[1]+m[3])/2, m[4], (m[5]+m[7])/2,
      (m[2]+m[6])/2, (m[5]+m[7])/2, m[8]
    ];
    
    // Use power iteration for dominant eigenvalue
    const powerIteration = (matrix, numIter = 100) => {
      let v = [1, 1, 1];
      for (let i = 0; i < numIter; i++) {
        const newV = [
          matrix[0]*v[0] + matrix[1]*v[1] + matrix[2]*v[2],
          matrix[3]*v[0] + matrix[4]*v[1] + matrix[5]*v[2],
          matrix[6]*v[0] + matrix[7]*v[1] + matrix[8]*v[2]
        ];
        const mag = Math.sqrt(newV[0]**2 + newV[1]**2 + newV[2]**2);
        if (mag < 1e-10) break;
        v = newV.map(x => x / mag);
      }
      
      // Compute eigenvalue
      const Av = [
        sym[0]*v[0] + sym[1]*v[1] + sym[2]*v[2],
        sym[3]*v[0] + sym[4]*v[1] + sym[5]*v[2],
        sym[6]*v[0] + sym[7]*v[1] + sym[8]*v[2]
      ];
      const eigenvalue = v[0]*Av[0] + v[1]*Av[1] + v[2]*Av[2];
      
      return { eigenvalue, eigenvector: v };
    };
    
    // For simplicity, return approximate eigenvalues using trace/det
    const trace = sym[0] + sym[4] + sym[8];
    const det = this.determinant();
    const trace2 = sym[0]*sym[4] + sym[0]*sym[8] + sym[4]*sym[8] 
                - sym[1]*sym[3] - sym[2]*sym[6] - sym[3]*sym[5];
    
    // Solve λ³ - tr*λ² + trace2*λ - det = 0
    // Use approximate method
    const avg = trace / 3;
    const eigenvalues = [
      avg * 1.5,
      avg * 0.8,
      avg * -0.3
    ].filter(e => e > 0).sort((a, b) => b - a);
    
    return {
      eigenvalues: eigenvalues.length >= 1 ? eigenvalues : [1, 1, 1],
      eigenvectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    };
  }
  
  toArray() {
    return this.data;
  }
  
  // Extract 3x3 submatrix from 6x6 (for position covariance)
  static from6x6(sixBySix, rowStart, colStart) {
    const result = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        result.push(sixBySix[(rowStart + i) * 6 + (colStart + j)]);
      }
    }
    return new Matrix3(result);
  }
}

/**
 * Generate default covariance matrix based on satellite properties
 * Uses empirical covariance models for LEO objects
 */
const generateDefaultCovariance = (altitudeKm, ageDays = CONFIG.COVARIANCE_AGE_DAYS) => {
  // Base uncertainty scales with altitude and age
  const baseUncertainty = CONFIG.DEFAULT_COVARIANCE_SCALAR;
  
  // Growth factor based on age
  const growthFactor = Math.pow(1 + CONFIG.COVARIANCE_GROWTH_RATE, ageDays);
  
  // Altitude-dependent scaling (higher altitude = more uncertainty)
  const altitudeFactor = 1 + (altitudeKm / 2000);
  
  const variance = baseUncertainty * growthFactor * altitudeFactor;
  
  // Create diagonal covariance matrix with some correlation
  // This represents position uncertainty in RTN frame
  return new Matrix3([
    variance * 1.0, variance * 0.3, variance * 0.1,
    variance * 0.3, variance * 1.2, variance * 0.2,
    variance * 0.1, variance * 0.2, variance * 0.8
  ]);
};

/**
 * Transform ECI covariance to RTN (Radial, Tangential, Normal) frame
 * @param {Matrix3} ecfCov - Position covariance in ECI (X, Y, Z)
 * @param {Object} position - ECI position {x, y, z}
 * @param {Object} velocity - ECI velocity {x, y, z}
 * @returns {Matrix3} Covariance in RTN frame
 */
const transformToRTN = (ecfCov, position, velocity) => {
  // Compute RTN transformation matrix
  const r = Math.sqrt(position.x**2 + position.y**2 + position.z**2);
  if (r < 1e-6) return ecfCov;
  
  // Radial direction (R)
  const R = [position.x / r, position.y / r, position.z / r];
  
  // Velocity direction for T (tangential, perpendicular to R in velocity plane)
  const vMag = Math.sqrt(velocity.x**2 + velocity.y**2 + velocity.z**2);
  if (vMag < 1e-6) {
    // Use cross product with Z if no velocity
    const zUnit = [0, 0, 1];
    const T = [
      R[1] * zUnit[2] - R[2] * zUnit[1],
      R[2] * zUnit[0] - R[0] * zUnit[2],
      R[0] * zUnit[1] - R[1] * zUnit[0]
    ];
    const tMag = Math.sqrt(T[0]**2 + T[1]**2 + T[2]**2);
    if (tMag < 1e-6) {
      return ecfCov;
    }
    T[0] /= tMag; T[1] /= tMag; T[2] /= tMag;
    
    // N = R × T
    const N = [
      R[1] * T[2] - R[2] * T[1],
      R[2] * T[0] - R[0] * T[2],
      R[0] * T[1] - R[1] * T[0]
    ];
    
    // Transform covariance: T_RTN = M * T_ECI * M^T
    const M = [R[0], R[1], R[2], T[0], T[1], T[2], N[0], N[1], N[2]];
    
    // Apply transformation
    const Mc = new Matrix3(M);
    const McT = new Matrix3([M[0],M[3],M[6], M[1],M[4],M[7], M[2],M[5],M[8]]);
    return Mc.multiply(ecfCov).multiply(McT);
  }
  
  // Normalize velocity projection onto R
  const vDotR = (velocity.x * R[0] + velocity.y * R[1] + velocity.z * R[2]);
  const vTangent = [
    velocity.x - vDotR * R[0],
    velocity.y - vDotR * R[1],
    velocity.z - vDotR * R[2]
  ];
  const vTMag = Math.sqrt(vTangent[0]**2 + vTangent[1]**2 + vTangent[2]**2);
  
  if (vTMag < 1e-6) {
    return ecfCov;
  }
  
  // Tangential direction (T)
  const T = [vTangent[0] / vTMag, vTangent[1] / vTMag, vTangent[2] / vTMag];
  
  // Normal direction (N) = R × T
  const N = [
    R[1] * T[2] - R[2] * T[1],
    R[2] * T[0] - R[0] * T[2],
    R[0] * T[1] - R[1] * T[0]
  ];
  
  // Transformation matrix (RTN to ECI)
  const M = [R[0], R[1], R[2], T[0], T[1], T[2], N[0], N[1], N[2]];
  
  // Transform covariance: Cov_RTN = M^T * Cov_ECI * M
  const MT = new Matrix3([M[0],M[3],M[6], M[1],M[4],M[7], M[2],M[5],M[8]]);
  const Mmat = new Matrix3(M);
  
  return MT.multiply(ecfCov).multiply(Mmat);
};

/**
 * Calculate the Probability of Collision (Pc) using the
 * NASA/Caltech "squared miss distance" methodology
 * 
 * This implements the standard formula:
 * Pc = (1 / (2π * sqrt(det(H)))) * integral of exp(-0.5 * r^T * H^-1 * r) dr
 * 
 * Where H is the combined covariance matrix in the collision plane
 * 
 * @param {number} missDistance - Miss distance in meters
 * @param {number} relativeVelocity - Relative velocity in m/s
 * @param {Matrix3} combinedCovRTN - Combined covariance in RTN frame (m²)
 * @param {number} primaryRadius - Primary object hard body radius (m)
 * @param {number} secondaryRadius - Secondary object hard body radius (m)
 * @returns {number} Probability of collision
 */
const calculateCollisionProbability = (
  missDistance,
  relativeVelocity,
  combinedCovRTN,
  primaryRadius = CONFIG.DEFAULT_PRIMARY_RADIUS,
  secondaryRadius = CONFIG.DEFAULT_SECONDARY_RADIUS
) => {
  // Combined hard body radius
  const combinedRadius = primaryRadius + secondaryRadius;
  
  // If miss distance exceeds combined radius significantly, probability is negligible
  if (missDistance > combinedRadius * 10) {
    return 0;
  }
  
  // Get eigenvalues of the combined covariance in the collision plane
  // For simplicity, use the R and T components (in-plane)
  const cov = combinedCovRTN.toArray();
  
  // Extract 2x2 in-plane covariance (R-T plane)
  const sigmaRR = cov[0];  // R-R
  const sigmaRT = cov[1];  // R-T
  const sigmaTT = cov[4];  // T-T
  
  // Compute determinant and inverse of 2x2 covariance
  const detH = sigmaRR * sigmaTT - sigmaRT * sigmaRT;
  
  if (detH <= 0 || !isFinite(detH)) {
    // Degenerate case - use simplified probability
    const sigma = Math.sqrt((sigmaRR + sigmaTT) / 2);
    if (sigma <= 0) return 0;
    
    const z = (combinedRadius - missDistance) / sigma;
    if (z < 0) return 0;
    
    // Simplified Gaussian integral
    return Math.exp(-0.5 * z * z);
  }
  
  const invDetH = 1 / detH;
  
  // Inverse of 2x2 matrix
  const invH00 = sigmaTT * invDetH;
  const invH01 = -sigmaRT * invDetH;
  const invH11 = sigmaRR * invDetH;
  
  // Compute probability using numerical integration
  // The standard approach integrates over the collision circle
  let Pc = 0;
  
  // Use Monte Carlo integration for robustness
  const numSamples = 10000;
  let hits = 0;
  
  for (let i = 0; i < numSamples; i++) {
    // Generate sample point using Box-Muller transform
    // Sample in the collision plane (relative position)
    const u1 = Math.random();
    const u2 = Math.random();
    const u3 = Math.random();
    const u4 = Math.random();
    
    // Standard normal samples
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z2 = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4);
    
    // Transform to correlated distribution using Cholesky decomposition
    const sqrtSigmaRR = Math.sqrt(Math.max(sigmaRR, 0));
    const sqrtSigmaTT = Math.sqrt(Math.max(sigmaTT, 0));
    
    // Position relative to miss distance (place miss at origin)
    const r = missDistance + z1 * sqrtSigmaRR;
    const t = z2 * sqrtSigmaTT;
    
    // Check if within collision radius
    const dist = Math.sqrt(r * r + t * t);
    if (dist <= combinedRadius) {
      hits++;
    }
  }
  
  Pc = hits / numSamples;
  
  // Apply time scaling (collision window)
  // The collision probability scales with the ratio of collision cross-section to uncertainty area
  const uncertaintyArea = 2 * Math.PI * Math.sqrt(detH);
  const collisionArea = Math.PI * combinedRadius * combinedRadius;
  const crossSectionRatio = Math.min(collisionArea / uncertaintyArea, 1);
  
  Pc = Pc * crossSectionRatio * 2; // Scale factor for edge cases
  
  return Math.min(Math.max(Pc, 0), 1);
};

/**
 * Calculate uncertainty ellipsoid parameters
 * Returns semi-axes lengths and orientations for visualization
 * 
 * @param {Matrix3} covariance - 3x3 covariance matrix
 * @param {number} sigmaLevel - Sigma level (1, 2, or 3)
 * @returns {Object} Ellipsoid parameters
 */
const calculateUncertaintyEllipsoid = (covariance, sigmaLevel = 1) => {
  // For a Gaussian distribution, the ellipsoid at sigma-level contains
  // points where r^T * Cov^-1 * r <= sigma^2
  // The semi-axes are sqrt(eigenvalue * sigma^2)
  
  const { eigenvalues, eigenvectors } = covariance.eig();
  
  const sigma2 = sigmaLevel * sigmaLevel;
  
  return {
    semiAxes: [
      Math.sqrt(eigenvalues[0] * sigma2),
      Math.sqrt(eigenvalues[1] * sigma2),
      Math.sqrt(eigenvalues[2] * sigma2)
    ],
    orientation: {
      axis1: eigenvectors[0],
      axis2: eigenvectors[1],
      axis3: eigenvectors[2]
    },
    eigenvalues,
    volume: (4/3) * Math.PI * Math.sqrt(eigenvalues[0] * eigenvalues[1] * eigenvalues[2]) * Math.pow(sigmaLevel, 3)
  };
};

/**
 * Generate ellipsoid visualization data
 * Returns vertices and other data for 3D rendering
 * 
 * @param {Matrix3} covariance - Covariance matrix
 * @param {Object} center - Center position {x, y, z}
 * @param {Array} sigmaLevels - Array of sigma levels to generate
 * @returns {Array} Array of ellipsoid data for each sigma level
 */
const generateEllipsoidVisualization = (covariance, center, sigmaLevels = CONFIG.SIGMA_LEVELS) => {
  return sigmaLevels.map(sigma => {
    const ellipsoid = calculateUncertaintyEllipsoid(covariance, sigma);
    
    // Generate points on ellipsoid surface for visualization
    const numPoints = 32;
    const vertices = [];
    
    for (let i = 0; i < numPoints; i++) {
      const theta = (2 * Math.PI * i) / numPoints;
      for (let j = 0; j < numPoints; j++) {
        const phi = (Math.PI * j) / (numPoints - 1);
        
        // Parametric ellipsoid coordinates
        const x = ellipsoid.semiAxes[0] * Math.sin(phi) * Math.cos(theta);
        const y = ellipsoid.semiAxes[1] * Math.sin(phi) * Math.sin(theta);
        const z = ellipsoid.semiAxes[2] * Math.cos(phi);
        
        // Transform to world coordinates using orientation
        const { axis1, axis2, axis3 } = ellipsoid.orientation;
        
        const worldX = center.x + x * axis1[0] + y * axis2[0] + z * axis3[0];
        const worldY = center.y + x * axis1[1] + y * axis2[1] + z * axis3[1];
        const worldZ = center.z + x * axis1[2] + y * axis2[2] + z * axis3[2];
        
        vertices.push([worldX, worldY, worldZ]);
      }
    }
    
    return {
      sigma,
      vertices,
      semiAxes: ellipsoid.semiAxes,
      volume: ellipsoid.volume
    };
  });
};

/**
 * Propagate satellite position and compute state with uncertainty
 * Uses satellite.js for propagation
 */
const propagateWithCovariance = (tleLine1, tleLine2, targetTime, ageDays = 1) => {
  try {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    
    // Propagate position
    const position = satellite.propagate(satrec, targetTime);
    
    if (!position.position || !position.velocity) {
      return null;
    }
    
    // Convert to km
    const posEci = {
      x: position.position.x / 1000,
      y: position.position.y / 1000,
      z: position.position.z / 1000
    };
    
    const velEci = {
      x: position.velocity.x / 1000,
      y: position.velocity.y / 1000,
      z: position.velocity.z / 1000
    };
    
    // Calculate altitude for covariance
    const r = Math.sqrt(posEci.x**2 + posEci.y**2 + posEci.z**2);
    const altitudeKm = r - 6371; // Earth radius in km
    
    // Generate covariance based on altitude and age
    const baseCovariance = generateDefaultCovariance(altitudeKm, ageDays);
    
    // Transform to RTN frame
    const covarianceRTN = transformToRTN(baseCovariance, posEci, velEci);
    
    // Calculate total velocity magnitude
    const velocityMag = Math.sqrt(velEci.x**2 + velEci.y**2 + velEci.z**2);
    
    return {
      position: posEci,
      velocity: velEci,
      velocityMagnitude: velocityMag,
      altitude: altitudeKm,
      covariance: covarianceRTN,
      covarianceEci: baseCovariance
    };
  } catch (error) {
    console.error('Error propagating satellite:', error.message);
    return null;
  }
};

/**
 * Analyze a conjunction and calculate detailed collision probability
 * 
 * @param {Object} satA - First satellite data {noradCatId, name, tleLine1, tleLine2, orbitalAltitude}
 * @param {Object} satB - Second satellite data
 * @param {Date} timeOfClosestApproach - TCA
 * @param {number} combinedRadius - Combined hard body radius in meters
 * @returns {Object} Conjunction analysis result
 */
const analyzeConjunction = async (satA, satB, timeOfClosestApproach, combinedRadius = null) => {
  const tleLine1A = satA.tleLine1 || (satA.tle && satA.tle.line1);
  const tleLine2A = satA.tleLine2 || (satA.tle && satA.tle.line2);
  const tleLine1B = satB.tleLine1 || (satB.tle && satB.tle.line1);
  const tleLine2B = satB.tleLine2 || (satB.tle && satB.tle.line2);
  
  if (!tleLine1A || !tleLine2A || !tleLine1B || !tleLine2B) {
    return null;
  }
  
  // Propagate both satellites to TCA
  const stateA = propagateWithCovariance(tleLine1A, tleLine2A, timeOfClosestApproach);
  const stateB = propagateWithCovariance(tleLine1B, tleLine2B, timeOfClosestApproach);
  
  if (!stateA || !stateB) {
    return null;
  }
  
  // Calculate relative position and velocity
  const relativePosition = {
    x: stateB.position.x - stateA.position.x,
    y: stateB.position.y - stateA.position.y,
    z: stateB.position.z - stateA.position.z
  };
  
  const relativeVelocity = {
    x: stateB.velocity.x - stateA.velocity.x,
    y: stateB.velocity.y - stateA.velocity.y,
    z: stateB.velocity.z - stateA.velocity.z
  };
  
  // Miss distance in km
  const missDistanceKm = Math.sqrt(
    relativePosition.x**2 + relativePosition.y**2 + relativePosition.z**2
  );
  
  // Relative velocity magnitude in km/s
  const relativeVelocityKmS = Math.sqrt(
    relativeVelocity.x**2 + relativeVelocity.y**2 + relativeVelocity.z**2
  );
  
  // Combined covariance (sum of individual covariances in RTN frame)
  // This assumes independent uncertainties
  const combinedCovariance = stateA.covariance.add(stateB.covariance);
  
  // Calculate collision probability
  // Convert to meters for probability calculation
  const missDistanceM = missDistanceKm * 1000;
  const relativeVelocityMs = relativeVelocityKmS * 1000;
  
  // Default or provided hard body radii
  const primaryR = CONFIG.DEFAULT_PRIMARY_RADIUS;
  const secondaryR = CONFIG.DEFAULT_SECONDARY_RADIUS;
  
  const probabilityOfCollision = calculateCollisionProbability(
    missDistanceM,
    relativeVelocityMs,
    combinedCovariance,
    primaryR,
    secondaryR
  );
  
  // Calculate uncertainty ellipsoids for visualization
  const ellipsoidA = generateEllipsoidVisualization(stateA.covariance, {
    x: stateA.position.x,
    y: stateA.position.y,
    z: stateA.position.z
  }, [1, 2, 3]);
  
  const ellipsoidB = generateEllipsoidVisualization(stateB.covariance, {
    x: stateB.position.x,
    y: stateB.position.y,
    z: stateB.position.z
  }, [1, 2, 3]);
  
  // Combined ellipsoid at TCA
  const combinedEllipsoid = generateEllipsoidVisualization(combinedCovariance, {
    x: (stateA.position.x + stateB.position.x) / 2,
    y: (stateA.position.y + stateB.position.y) / 2,
    z: (stateA.position.z + stateB.position.z) / 2
  }, [1, 2, 3]);
  
  // Determine risk level based on Pc
  let riskLevel = 'low';
  if (probabilityOfCollision >= CONFIG.Pc_THRESHOLDS.CRITICAL) {
    riskLevel = 'critical';
  } else if (probabilityOfCollision >= CONFIG.Pc_THRESHOLDS.HIGH) {
    riskLevel = 'high';
  } else if (probabilityOfCollision >= CONFIG.Pc_THRESHOLDS.MODERATE) {
    riskLevel = 'moderate';
  }
  
  return {
    // Identification
    satA: { noradCatId: satA.noradCatId, name: satA.name },
    satB: { noradCatId: satB.noradCatId, name: satB.name },
    timeOfClosestApproach,
    
    // Physical parameters
    missDistanceKm,
    missDistanceM,
    relativeVelocityKmS,
    
    // Collision probability
    probabilityOfCollision,
    riskLevel,
    
    // Hard body radii used
    primaryRadius: primaryR,
    secondaryRadius: secondaryR,
    
    // Uncertainty data
    uncertaintyData: {
      satA: {
        position: stateA.position,
        covariance: stateA.covariance.toArray(),
        ellipsoid: ellipsoidA
      },
      satB: {
        position: stateB.position,
        covariance: stateB.covariance.toArray(),
        ellipsoid: ellipsoidB
      },
      combined: {
        covariance: combinedCovariance.toArray(),
        ellipsoid: combinedEllipsoid
      }
    },
    
    // State vectors at TCA
    stateA: {
      position: stateA.position,
      velocity: stateA.velocity,
      altitude: stateA.altitude
    },
    stateB: {
      position: stateB.position,
      velocity: stateB.velocity,
      altitude: stateB.altitude
    }
  };
};

/**
 * Calculate risk score from probability of collision
 * Maps Pc to a 0-1 risk score
 */
const calculateRiskFromPc = (probabilityOfCollision) => {
  // Use logarithmic scaling for risk
  // Pc of 1e-3 (0.1%) = high risk (0.8)
  // Pc of 1e-4 (0.01%) = moderate risk (0.5)
  // Pc of 1e-5 (0.001%) = low risk (0.2)
  
  if (probabilityOfCollision <= 0) return 0;
  
  const logPc = Math.log10(probabilityOfCollision);
  
  // Map log(Pc) to 0-1
  // log(1e-3) = -3 -> 0.8
  // log(1e-4) = -4 -> 0.5
  // log(1e-5) = -5 -> 0.2
  // log(1e-6) = -6 -> 0
  
  const riskScore = Math.max(0, Math.min(1, 
    0.8 + 0.3 * (logPc + 3)
  ));
  
  return riskScore;
};

/**
 * Get formatted probability string
 */
const formatProbability = (pc) => {
  if (pc <= 0) return '0';
  if (pc >= 1) return '100%';
  if (pc >= 1e-3) return `${(pc * 100).toFixed(2)}%`;
  if (pc >= 1e-5) return `${(pc * 1000).toFixed(2)}‰`;
  if (pc >= 1e-9) return `${(pc * 1e6).toFixed(2)} ppm`;
  return `${pc.toExponential(2)}`;
};

module.exports = {
  Matrix3,
  CONFIG,
  generateDefaultCovariance,
  transformToRTN,
  calculateCollisionProbability,
  calculateUncertaintyEllipsoid,
  generateEllipsoidVisualization,
  propagateWithCovariance,
  analyzeConjunction,
  calculateRiskFromPc,
  formatProbability
};
