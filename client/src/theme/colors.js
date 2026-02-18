export const colors = {
  deepSpace: '#0B0F1A',
  cosmicBlue: '#1E3A8A',
  neonCyan: '#22D3EE',
  solarAmber: '#F59E0B',
  alertRed: '#EF4444',
  spaceDark: '#05070D',
  glass: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textMuted: 'rgba(255, 255, 255, 0.5)'
};

export const getRiskColor = (riskScore) => {
  if (riskScore < 0.3) return colors.neonCyan;
  if (riskScore < 0.6) return colors.solarAmber;
  return colors.alertRed;
};

export const getRiskLabel = (riskScore) => {
  if (riskScore < 0.3) return 'Low';
  if (riskScore < 0.6) return 'Medium';
  return 'High';
};

export const orbitalBands = {
  leo: { min: 200, max: 2000, color: '#22D3EE', label: 'LEO' },
  meo: { max: 35786, color: '#F59E0B', label: 'MEO' },
  geo: { min: 35786, color: '#EF4444', label: 'GEO' }
};

export const getOrbitalBand = (altitude) => {
  if (altitude <= 2000) return orbitalBands.leo;
  if (altitude <= 35786) return orbitalBands.meo;
  return orbitalBands.geo;
};
