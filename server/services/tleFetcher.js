const axios = require('axios');
const Satellite = require('../models/Satellite');
const { logger } = require('../utils/logger');
const { retry, withStandardRetry } = require('../utils/retry');
const { executeWithCircuitBreaker, circuitBreakers } = require('../utils/circuitBreaker');

const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=txt';
const TLE_URL_FALLBACK = 'https://www.celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=txt';

const TLE_VALIDATION = {
  MIN_LINE_LENGTH: 69,
  MAX_LINE_LENGTH: 69,
  REQUIRED_FIELDS: ['noradCatId', 'name', 'tleLine1', 'tleLine2']
};

// Validation helper
const isValidTLE = (line1, line2) => {
  return line1?.length === TLE_VALIDATION.MIN_LINE_LENGTH && 
         line2?.length === TLE_VALIDATION.MIN_LINE_LENGTH;
};

const parseTLE = (tleData) => {
  if (!tleData || typeof tleData !== 'string') {
    logger.warn('Invalid TLE data received', { service: 'tle-fetcher' });
    return [];
  }
  
  const lines = tleData.split('\n').filter(line => line.trim());
  const satellites = [];

  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 >= lines.length) break;

    const name = lines[i].trim();
    const tleLine1 = lines[i + 1]?.trim();
    const tleLine2 = lines[i + 2]?.trim();

    if (!isValidTLE(tleLine1, tleLine2)) continue;

    try {
      const noradCatId = parseInt(tleLine1.substring(2, 7).trim());
      if (isNaN(noradCatId)) continue;

      const classification = tleLine1.charAt(7);
      const internationalDesignator = tleLine1.substring(9, 17).trim();
      const epochYear = parseInt(tleLine1.substring(18, 20));
      const epochDay = parseFloat(tleLine1.substring(20, 32));
      const meanMotionDot = parseFloat(tleLine1.substring(33, 43));
      const bstar = parseFloat(tleLine1.substring(53, 61)) * 1e-5;
      const ephemerisType = parseInt(tleLine1.charAt(62));
      const elementSetNum = parseInt(tleLine1.substring(63, 68));

      const inclination = parseFloat(tleLine2.substring(8, 16));
      const eccentricity = parseFloat('0.' + tleLine2.substring(17, 25));
      const raan = parseFloat(tleLine2.substring(26, 34));
      const argumentOfPerigee = parseFloat(tleLine2.substring(34, 42));
      const meanAnomaly = parseFloat(tleLine2.substring(43, 51));
      const meanMotion = parseFloat(tleLine2.substring(52, 63));
      const orbitNumber = parseInt(tleLine2.substring(63, 68));

      const orbitalPeriod = 1440 / meanMotion;
      const earthRadius = 6371;
      const semiMajorAxis = Math.pow((orbitalPeriod / (2 * Math.PI)) * 137.93, 1/3) * earthRadius;
      const orbitalAltitude = semiMajorAxis - earthRadius;

      satellites.push({
        noradCatId,
        name,
        tleLine1,
        tleLine2,
        classification,
        internationalDesignator,
        epochYear,
        epochDay,
        meanMotionDot,
        bstar,
        ephemerisType,
        elementSetNum,
        inclination,
        eccentricity,
        raan,
        argumentOfPerigee,
        meanAnomaly,
        meanMotion,
        orbitNumber,
        orbitalAltitude,
        lastUpdated: new Date()
      });
    } catch (e) {
      logger.debug(`Error parsing TLE for ${name}: ${e.message}`, { service: 'tle-fetcher' });
    }
  }

  return satellites;
};

// Fetch with circuit breaker and retry logic
const fetchWithRetry = async (url, retries = 3) => {
  return withStandardRetry(async () => {
    const response = await axios.get(url, { 
      timeout: 30000,
      headers: { 'User-Agent': 'AstraShield/1.0' }
    });
    return response.data;
  }, { operationName: `fetch-tle-${url}` });
};

const fetchAndStoreTLE = async () => {
  let tleData;
  
  // Use circuit breaker for primary source
  try {
    logger.info('Fetching TLE data from CelesTrak (primary)...', { service: 'tle-fetcher' });
    tleData = await executeWithCircuitBreaker('tleApi', async () => {
      return fetchWithRetry(TLE_URL);
    });
  } catch (primaryError) {
    // Circuit breaker open or primary failed, try fallback
    logger.warn('Primary TLE source unavailable, trying fallback...', { 
      service: 'tle-fetcher',
      error: primaryError.message 
    });
    
    try {
      tleData = await executeWithCircuitBreaker('tleFallback', async () => {
        return fetchWithRetry(TLE_URL_FALLBACK);
      });
    } catch (fallbackError) {
      logger.error('All TLE sources failed', { 
        service: 'tle-fetcher',
        primaryError: primaryError.message,
        fallbackError: fallbackError.message
      });
      throw new Error(`TLE fetch failed: ${primaryError.message}`);
    }
  }
  
  const satellites = parseTLE(tleData);
  
  if (satellites.length === 0) {
    throw new Error('No valid satellites parsed from TLE data');
  }
  
  logger.info(`Parsed ${satellites.length} satellites from TLE data`, { service: 'tle-fetcher' });

  // Use bulk operations for efficiency
  const operations = satellites.map(sat => ({
    updateOne: {
      filter: { noradCatId: sat.noradCatId },
      update: { $set: sat },
      upsert: true
    }
  }));

  const result = await Satellite.bulkWrite(operations, { ordered: false });
  
  logger.info(`TLE Update Complete: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`, { 
    service: 'tle-fetcher',
    inserted: result.upsertedCount,
    modified: result.modifiedCount,
    total: satellites.length
  });
  return { 
    inserted: result.upsertedCount, 
    updated: result.modifiedCount, 
    total: satellites.length 
  };
};

module.exports = { fetchAndStoreTLE, parseTLE };
