import * as Sentry from '@sentry/react';

interface ErrorContext {
  component?: string;
  userId?: string;
  trackId?: string;
  [key: string]: any;
}

/**
 * Log an error to Sentry with consistent context structure
 * 
 * @param error The error object to capture
 * @param context Additional context about the error
 */
export const logError = (error: Error | unknown, context: ErrorContext = {}) => {
  console.error('[Error]:', error);
  
  Sentry.withScope((scope) => {
    // Set tags for filtering in Sentry dashboard
    if (context.component) {
      scope.setTag('component', context.component);
    }
    
    if (context.trackId) {
      scope.setTag('trackId', context.trackId);
    }
    
    // Set user information if available
    if (context.userId) {
      scope.setUser({ id: context.userId });
    }
    
    // Add all other context properties as extras
    Object.entries(context).forEach(([key, value]) => {
      if (key !== 'component' && key !== 'userId' && key !== 'trackId') {
        scope.setExtra(key, value);
      }
    });
    
    Sentry.captureException(error);
  });
};

/**
 * Wrap an async function with error handling
 * Captures errors with Sentry and continues execution
 * 
 * @param fn The async function to wrap
 * @param context Context information to include with errors
 * @param fallback Optional fallback value to return on error
 */
export const withErrorHandling = async <T>(
  fn: () => Promise<T>,
  context: ErrorContext = {},
  fallback?: T
): Promise<T | undefined> => {
  try {
    return await fn();
  } catch (error) {
    logError(error, context);
    return fallback;
  }
}; 