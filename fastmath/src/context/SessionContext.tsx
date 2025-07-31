import React, { createContext, useState, useCallback, useContext, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import * as api from '../config/api';
import { useLocation } from 'react-router-dom';

// Import the ActivityType type
type ActivityType = 'learning' | 'accuracyPractice' | 'fluencyPractice' | 'assessment' | 'other';
type PageType = 'dashboard' | 'learn' | 'practice' | 'timed-practice' | 'accuracy-practice' | 'fluency-practice' | 'assessment' | 'onboarding' | 'other';

// Define the FactsByStage type to match the backend
type FactsByStage = {
  learning?: string[];
  accuracyPractice?: string[];
  fluency6Practice?: string[];
  fluency3Practice?: string[];
  fluency2Practice?: string[];
  fluency1_5Practice?: string[];
  fluency1Practice?: string[];
};

interface SessionContextType {
  recordPageTransition: (page: PageType, factsByStage?: FactsByStage) => void;
  isSessionActive: boolean;
}

export const SessionContext = createContext<SessionContextType>({
  recordPageTransition: () => {},
  isSessionActive: true
});

// Additional window to treat same-page transitions as duplicates (ms)
const DUPLICATE_WINDOW_MS = 5000; // 5 seconds – must match backend logic

// Minimum time (in ms) between recording page transitions to prevent excessive API calls
const MIN_TRANSITION_INTERVAL = 500;
// Maximum retry attempts for failed API calls
const MAX_RETRY_ATTEMPTS = 3;
// Delay between retry attempts (in ms)
const RETRY_DELAY = 1000;

// Helper function to map route paths to page types
const getPageTypeFromPath = (path: string): PageType => {
  if (path === '/' || path.startsWith('/dashboard')) return 'dashboard';
  if (path === '/learn') return 'learn';
  if (path === '/practice') return 'learn';  // Map practice to learn
  if (path === '/timedpractice') return 'learn';  // Map timed-practice to learn
  if (path.startsWith('/accuracy-practice')) return 'accuracy-practice';
  if (path.startsWith('/fluency-practice')) return 'fluency-practice';
  // Treat progress assessment and onboarding assessment pages as assessment activities
  if (path.startsWith('/progress-assessment')) return 'assessment';
  if (path.startsWith('/onboarding')) return 'onboarding';
  return 'other';
};

export const SessionProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const { user } = useAuth();
  const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';
  const location = useLocation();
  
  // Ref to track the last transition time to implement debouncing
  const lastTransitionTimeRef = useRef<number>(0);
  // Ref to track the last recorded page to prevent duplicates
  const lastPageRef = useRef<PageType | null>(null);
  // Ref to track the last successfully ACCEPTED transition time (used for duplicate suppression)
  const lastAcceptedTimeRef = useRef<number>(0);

  // Function to record transition with retry logic
  const recordTransitionWithRetry = useCallback(async (
    userId: string,
    currentTrackId: string,
    page: PageType,
    factsByStage?: FactsByStage,
    attempt: number = 1
  ) => {
    try {
      const now = Date.now();

      // 1. Treat very rapid duplicate transitions (same page, no new facts) within DUPLICATE_WINDOW_MS as duplicates
      if (
        lastPageRef.current === page &&
        !factsByStage &&
        now - lastAcceptedTimeRef.current < DUPLICATE_WINDOW_MS
      ) {
        return;
      }

      // 2. Throttle *identical* page transitions that occur too quickly (< MIN_TRANSITION_INTERVAL)
      if (
        lastPageRef.current === page &&
        now - lastTransitionTimeRef.current < MIN_TRANSITION_INTERVAL
      ) {
        console.log('Throttling rapid duplicate page transition');
        return;
      }

      // Update timing refs for this attempt
      lastTransitionTimeRef.current = now;
      lastPageRef.current = page;

      const response = await api.recordPageTransition({
        userId,
        trackId: currentTrackId,
        page: page as any, // cast to align with API PageType
        factsByStage
      });

      if (response.success) {
        lastAcceptedTimeRef.current = now;
      } else if (attempt < MAX_RETRY_ATTEMPTS) {
        // Wait and retry with exponential backoff
        setTimeout(() => {
          recordTransitionWithRetry(userId, currentTrackId, page, factsByStage, attempt + 1);
        }, RETRY_DELAY * Math.pow(2, attempt - 1));
      }
    } catch (error) {
      console.error('Failed to record page transition:', error);

      if (attempt < MAX_RETRY_ATTEMPTS) {
        // Wait and retry with exponential backoff
        setTimeout(() => {
          recordTransitionWithRetry(userId, currentTrackId, page, factsByStage, attempt + 1);
        }, RETRY_DELAY * Math.pow(2, attempt - 1));
      }
    }
  }, []);
  
  // Record page transition when location changes
  useEffect(() => {
    if (user?.userId) {
      const pageType = getPageTypeFromPath(location.pathname);
      recordTransitionWithRetry(user.userId, trackId, pageType);
    }
  }, [location.pathname, user?.userId, trackId, recordTransitionWithRetry]);
  
  // Public function for components to record transitions with fact data
  const recordPageTransition = useCallback((page: PageType, factsByStage?: FactsByStage) => {
    if (!user?.userId) return;
    recordTransitionWithRetry(user.userId, trackId, page, factsByStage);
  }, [user, trackId, recordTransitionWithRetry]);
  
  return (
    <SessionContext.Provider value={{ recordPageTransition, isSessionActive: true }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => useContext(SessionContext); 