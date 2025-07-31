import { Request, Response, NextFunction } from 'express';
import { isValidTimezone, hasSignificantClockSkew, getTodayInTimezone } from '../utils/dateUtils';

// Extend Request interface to include timezone properties
declare global {
  namespace Express {
    interface Request {
      timezone?: string;
      userDate?: string;
    }
  }
}

/**
 * Middleware to extract and validate timezone from request headers
 * Adds timezone and userDate to the request object
 */
export const timezoneMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract timezone from header
    const timezone = req.headers['x-user-timezone'] as string;
    const clientDate = req.headers['x-user-date'] as string;

    // If no timezone provided, use UTC (existing behavior)
    if (!timezone) {
      req.timezone = 'UTC';
      req.userDate = new Date().toISOString().split('T')[0];
      return next();
    }

    // Validate timezone
    if (!isValidTimezone(timezone)) {
      req.timezone = 'UTC';
      req.userDate = new Date().toISOString().split('T')[0];
      return next();
    }

    // Get today's date in the user's timezone
    const todayInTimezone = getTodayInTimezone(timezone);

    // If client provided a date, validate it for clock skew
    if (clientDate) {
      if (hasSignificantClockSkew(clientDate, timezone)) {
        res.status(400).json({
          success: false,
          message: 'Clock skew detected. Please check your device time and try again.',
          clientDate,
          serverDate: todayInTimezone
        });
        return;
      }
      req.userDate = clientDate;
    } else {
      req.userDate = todayInTimezone;
    }

    // Add to request object
    req.timezone = timezone;
    
    next();
  } catch (error) {
    console.error('[TimezoneMiddleware] Error processing timezone:', error);
    // Fallback to UTC on error
    req.timezone = 'UTC';
    req.userDate = new Date().toISOString().split('T')[0];
    next();
  }
}; 