/**
 * Date utility functions for consistent date handling across the application
 */

import { toZonedTime, format } from 'date-fns-tz';

/**
 * Compares two dates to check if they represent the same day
 * (ignoring time components)
 * 
 * @param date1 First date (can be Date object or ISO string)
 * @param date2 Second date (can be Date object or ISO string)
 * @returns boolean indicating if the dates represent the same day
 */
export const isSameDay = (date1: Date | string, date2: Date | string): boolean => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  // Set hours to 0 to compare just the dates
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  
  return d1.getTime() === d2.getTime();
};

/**
 * Checks if a date is today or earlier
 * (useful for determining if a fact is due for practice)
 * 
 * @param date Date to check (can be Date object or ISO string)
 * @returns boolean indicating if the date is today or earlier
 */
export const isDueToday = (date: Date | string): boolean => {
  const checkDate = new Date(date);
  const today = new Date();
  
  // Set hours to 0 to compare just the dates
  checkDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  return checkDate <= today;
};

/**
 * Returns a date object with time components set to zero
 * (useful for consistent date-only comparisons)
 * 
 * @param date Date to normalize (can be Date object or ISO string)
 * @returns Date object with time set to 00:00:00.000
 */
export const normalizeDateToDay = (date: Date | string): Date => {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate;
};

/**
 * Gets today's date with time set to 00:00:00.000
 * 
 * @returns Today's date with time components zeroed out
 */
export const getTodayNormalized = (): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

/**
 * Adds a specified number of days to a date
 * 
 * @param date The starting date (can be Date object or ISO string)
 * @param days Number of days to add
 * @returns New Date object with the days added
 */
export const addDays = (date: Date | string, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Gets today's date in a specific timezone as YYYY-MM-DD format
 * 
 * @param timezone IANA timezone identifier (e.g., 'America/New_York')
 * @returns Today's date in the specified timezone as YYYY-MM-DD string
 */
export const getTodayInTimezone = (timezone: string): string => {
  const now = new Date();
  const zonedDate = toZonedTime(now, timezone);
  return format(zonedDate, 'yyyy-MM-dd', { timeZone: timezone });
};

/**
 * Validates if a timezone string is valid
 * 
 * @param timezone IANA timezone identifier to validate
 * @returns boolean indicating if the timezone is valid
 */
export const isValidTimezone = (timezone: string): boolean => {
  try {
    // Try to create a date in the timezone
    // This will throw if the timezone is invalid
    toZonedTime(new Date(), timezone);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Checks if client and server dates differ by more than 1 day
 * This helps detect significant clock skew
 * 
 * @param clientDate Client-provided date string (YYYY-MM-DD format)
 * @param timezone Client timezone
 * @returns boolean indicating if there's significant clock skew
 */
export const hasSignificantClockSkew = (clientDate: string, timezone: string): boolean => {
  try {
    const serverDateInTimezone = getTodayInTimezone(timezone);
    const clientDateObj = new Date(clientDate + 'T00:00:00');
    const serverDateObj = new Date(serverDateInTimezone + 'T00:00:00');
    
    // Check if dates differ by more than 1 day
    const timeDiff = Math.abs(clientDateObj.getTime() - serverDateObj.getTime());
    const dayDiff = timeDiff / (1000 * 60 * 60 * 24);
    
    return dayDiff > 1;
  } catch (error) {
    console.error('Error checking clock skew:', error);
    return true; // Assume skew if we can't check
  }
};

/**
 * Formats a date as YYYY-MM-DD in a specific timezone
 * 
 * @param date Date to format (can be Date object or ISO string)
 * @param timezone IANA timezone identifier
 * @returns Date formatted as YYYY-MM-DD in the specified timezone
 */
export const formatDateInTimezone = (date: Date | string, timezone: string): string => {
  const dateObj = new Date(date);
  const zonedDate = toZonedTime(dateObj, timezone);
  return format(zonedDate, 'yyyy-MM-dd', { timeZone: timezone });
}; 