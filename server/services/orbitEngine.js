const satellite = require('satellite.js');

const propagateSatellite = (tleLine1, tleLine2) => {
  try {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const position = satellite.propagate(satrec, new Date());

    if (position.position) {
      // Return ECI position directly - no need for geodetic conversion
      return {
        x: position.position.x,
        y: position.position.y,
        z: position.position.z,
        latitude: 0,
        longitude: 0,
        altitude: 0
      };
    }
    return null;
  } catch (error) {
    console.error('Error propagating satellite:', error.message);
    return null;
  }
};

const getOrbitalPositions = (tleLine1, tleLine2, numPoints = 100) => {
  const positions = [];
  const periodMinutes = 96;

  try {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const now = new Date();

    for (let i = 0; i < numPoints; i++) {
      const time = new Date(now.getTime() + (i * periodMinutes * 60 * 1000) / numPoints);
      const position = satellite.propagate(satrec, time);

      if (position.position) {
        positions.push({
          x: position.position.x / 1000,
          y: position.position.y / 1000,
          z: position.position.z / 1000
        });
      }
    }
  } catch (error) {
    console.error('Error generating orbital positions:', error.message);
  }

  return positions;
};

const calculateOrbitalParameters = (tleLine1, tleLine2) => {
  try {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const position = satellite.propagate(satrec, new Date());

    if (position.velocity) {
      const velocityMagnitude = Math.sqrt(
        position.velocity.x ** 2 +
        position.velocity.y ** 2 +
        position.velocity.z ** 2
      );

      return {
        velocity: velocityMagnitude,
        semiMajorAxis: satrec.no,
        eccentricity: satrec.ecco,
        inclination: satellite.radiansToDegrees(satrec.inclo),
        raan: satellite.radiansToDegrees(satrec.nodeo),
        argumentOfPerigee: satellite.radiansToDegrees(satrec.argpo),
        meanAnomaly: satellite.radiansToDegrees(satrec.mo),
        period: 2 * Math.PI / satrec.no * 60,
        altitude: position.position ?
          Math.sqrt(
            position.position.x ** 2 +
            position.position.y ** 2 +
            position.position.z ** 2
          ) - 6371 : 0
      };
    }
    return null;
  } catch (error) {
    console.error('Error calculating orbital parameters:', error.message);
    return null;
  }
};

module.exports = {
  propagateSatellite,
  getOrbitalPositions,
  calculateOrbitalParameters
};
