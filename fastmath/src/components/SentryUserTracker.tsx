import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { useAuth } from '../context/AuthContext';

/**
 * A component that updates Sentry with the current user information
 * whenever the user's authentication state changes.
 * This ensures user ID is set globally for all Sentry events and session replays.
 */
export const SentryUserTracker: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      console.log('[SentryTracker] Setting user:', { 
        userId: user.userId,
        timestamp: new Date().toISOString(),
        locationPath: window.location.pathname
      });
      
      // Set user information globally in Sentry
      Sentry.setUser({
        id: user.userId,
        email: user.email
      });
      
      console.log('[Sentry] User ID set:', user.userId);
    } else {
      console.log('[SentryTracker] Clearing user, current location:', {
        path: window.location.pathname,
        timestamp: new Date().toISOString(),
        referrer: document.referrer || 'none'
      });
      
      // Clear user information when not logged in
      Sentry.setUser(null);
      console.log('[Sentry] User cleared');
    }
  }, [user]);

  // This component doesn't render anything itself, just forwards children
  return <>{children}</>;
}; 