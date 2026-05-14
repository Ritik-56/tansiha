// Date/time helpers used across reminder and adherence logic
const { format, startOfDay, endOfDay, isWithinInterval, parseISO } = require('date-fns');

/**
 * Get today's date string in YYYY-MM-DD
 */
const getTodayString = () => format(new Date(), 'yyyy-MM-dd');

/**
 * Get start and end of today as Date objects
 */
const getTodayRange = () => ({
  start: startOfDay(new Date()),
  end: endOfDay(new Date()),
});

/**
 * Check if a medicine is active today
 * @param {Date} startDate
 * @param {Date} endDate
 */
const isMedicineActiveToday = (startDate, endDate) => {
  return isWithinInterval(new Date(), {
    start: startOfDay(new Date(startDate)),
    end: endOfDay(new Date(endDate)),
  });
};

/**
 * Convert "HH:mm" time string to a full Date object for today
 * @param {string} timeStr - e.g. "08:30"
 */
const timeStringToDate = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

/**
 * Format a date to a readable string
 */
const formatReadable = (date) => format(new Date(date), 'dd MMM yyyy, hh:mm a');

module.exports = {
  getTodayString,
  getTodayRange,
  isMedicineActiveToday,
  timeStringToDate,
  formatReadable,
};
