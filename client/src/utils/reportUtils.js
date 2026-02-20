/**
 * Report download utility
 * Handles downloading PDF/CSV reports from the server
 */

/**
 * Download a blob as a file
 * @param {Blob} blob - The blob to download
 * @param {string} filename - The filename for the download
 */
export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * Format date for reports
 * @param {Date|string} date - The date to format
 * @returns {string} - Formatted date string (YYYY-MM-DD)
 */
export const formatDateForReport = (date) => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

/**
 * Get default date range (last 30 days)
 * @returns {Object} - Object with startDate and endDate
 */
export const getDefaultDateRange = () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  return {
    startDate: formatDateForReport(startDate),
    endDate: formatDateForReport(endDate)
  };
};

/**
 * Get common date range presets
 * @returns {Array} - Array of preset options
 */
export const dateRangePresets = [
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 90 Days', days: 90 },
  { label: 'Last 6 Months', days: 180 },
  { label: 'Last Year', days: 365 }
];

/**
 * Get date range from preset
 * @param {number} days - Number of days
 * @returns {Object} - Object with startDate and endDate
 */
export const getDateRangeFromPreset = (days) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return {
    startDate: formatDateForReport(startDate),
    endDate: formatDateForReport(endDate)
  };
};

/**
 * Risk level options for filtering
 */
export const riskLevelOptions = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' }
];

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
