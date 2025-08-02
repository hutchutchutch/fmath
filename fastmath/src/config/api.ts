import axios, { InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { UserProgress, SetUserProgressRequest, GetProgressApiResponse } from '../types/progress';
import { Fact } from '../components/Learn/types';
import { ProgressAssessment, ProgressAssessmentResponse } from '../types/progressAssessment';
import { jwtDecode } from 'jwt-decode';
import { useAuth } from '../context/AuthContext';
import { logError } from '../utils/errorReporting';
import { VoiceSessionResponse, VoiceTokenResponse } from '../types/voice';

// Add type augmentation for Axios config to support metadata
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}

interface AuthPayload {
    email: string;
    password: string;
    name?: string;
    ageGrade?: number;
}

interface AuthResponse {
    token: string;
    user?: {
        email: string;
    };
    trackId?: string;
    takeAssessment?: boolean;
}

interface ValidationResponse {
    valid: boolean;
    user?: {
        email: string;
        campus?: string;
    };
    message?: string;
}

interface TargetTimeResponse {
  timePerDigit: number;
  targetTime: number;
}

interface UserSearchResponse {
  users: Array<{
    userId: string;
    email: string;
  }>;
}

interface UserCQPMResponse {
  [userId: string]: {
    name: string;
    email: string;
    tracks: {
      [trackId: string]: {
        latestCQPM: number;
        changeFromAvg: number;
      }
    }
  }
}

interface ProgressMetrics {
  currentCQPM: number | null;
  changeCQPM: number | null;
}

interface TypingSpeedInput {
    count: number;
    time: number;
}

interface TimeEstimationResponse {
  totalMinutes: number;
}

interface TypingSpeedResponse {
    average: number;
    totalCount: number;
    weightedTime: number;
    updatedAt: string;
}

export interface GetSessionResponse {
  availableActivities: {
    learn?: {
      facts: Fact[];
    };
    accuracyPractice?: {
      facts: Fact[];
    };
    fluencyPractice?: {
      groupedFacts?: {
        [key: string]: Fact[];
      };
      facts?: Fact[];
      fluencyLevel?: string;
    };
  };
  progressAssessment: boolean;
  dailyAssessmentCount: number; // Count of progress assessments taken today
}

// Page transition types
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

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    
    if (token && config.headers) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Add request start time for tracking response time
    config.metadata = { startTime: new Date().getTime() };
    
    // Add logging for requests during accuracy practice
    if (window.location.pathname.includes('accuracy-practice')) {
        console.log('[API] Request initiated during accuracy practice:', {
            url: config.url,
            method: config.method,
            timestamp: new Date().toISOString(),
            hasToken: !!token
        });
    }
    
    return config;
}, error => {
    return Promise.reject(error);
});

api.interceptors.response.use(
    (response: AxiosResponse) => {
        // Calculate response time
        const config = response.config;
        if (config.metadata?.startTime) {
            const responseTime = new Date().getTime() - config.metadata.startTime;
            
            // Log all successful responses during accuracy practice
            if (window.location.pathname.includes('accuracy-practice')) {
                console.log(`[API] Response received during accuracy practice (${responseTime}ms):`, {
                    url: config.url,
                    method: config.method,
                    status: response.status,
                    timestamp: new Date().toISOString()
                });
            }
            // Only log slow responses (> 1000ms)
            else if (responseTime > 1000) {
                console.warn(`[API] Slow response detected (${responseTime}ms):`, {
                    url: config.url,
                    method: config.method,
                    status: response.status
                });
            }
        }
        return response;
    },
    (error: AxiosError) => {
        // Calculate response time for errors too
        if (error.config?.metadata?.startTime) {
            const responseTime = new Date().getTime() - error.config.metadata.startTime;
            
            // Log all errors during accuracy practice
            if (window.location.pathname.includes('accuracy-practice')) {
                console.error(`[API] Error response during accuracy practice (${responseTime}ms):`, {
                    url: error.config?.url,
                    method: error.config?.method,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data,
                    timestamp: new Date().toISOString(),
                    onLine: navigator.onLine
                });
            }
            // Add response time to error logs
            else if (!error.response) {
                console.error('[API] Network error:', error.message, {
                    url: error.config?.url,
                    method: error.config?.method,
                    timeoutSet: error.config?.timeout || 'default',
                    responseTime: `${responseTime}ms`,
                    timestamp: new Date().toISOString(),
                    onLine: navigator.onLine,
                    effectiveType: (navigator as any).connection?.effectiveType || 'unknown',
                    actionPath: window.location.pathname
                });
            }
        }
        
        if (error.response?.status === 401) {
            console.warn('[API] 401 detected, removing token and reloading page', {
                url: error.config?.url,
                method: error.config?.method,
                timestamp: new Date().toISOString(),
                pathname: window.location.pathname, // Add this to see if it's during accuracy practice
                hasToken: !!localStorage.getItem('token')
            });
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        
        return Promise.reject(error);
    }
);

export const login = async (credentials: AuthPayload): Promise<AuthResponse> => {
    try {
        const response = await api.post('/auth/login', credentials);

        if (!response.data || !response.data.token) {
            throw new Error('No token received from server');
        }

        return response.data;
    } catch (error) {
        if (error instanceof AxiosError) {
            throw new Error(error.response?.data?.message || 'Login failed');
        }
        throw error instanceof Error ? error : new Error('Login failed');
    }
};

export const signup = async (credentials: AuthPayload): Promise<AuthResponse> => {
    const response = await api.post('/auth/signup', credentials);

    if (!response.data) {
        const error = response.data;
        throw new Error(error.message || 'Signup failed');
    }

    return response.data;
};

export const validateToken = async (token: string): Promise<ValidationResponse> => {
    const startTime = Date.now();
    console.log('[API] Starting token validation request');
    
    try {
        const response = await api.post(
            '/auth/validate',
            {}, // Empty body
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            }
        );
        console.log(`[API] Token validation completed in ${Date.now() - startTime}ms, status: ${response.status}`);
        return response.data;
    } catch (error) {
        console.error(`[API] Token validation failed in ${Date.now() - startTime}ms:`, 
            error instanceof Error ? error.message : 'Unknown error');
        if (axios.isAxiosError(error) && error.response) {
            console.error('[API] Error response:', error.response.status, error.response.data);
        }
        return { valid: false, message: 'Token validation failed' };
    }
};

export const processMagicLinkToken = async (token: string): Promise<AuthResponse> => {
    const startTime = Date.now();
    console.log('[API] Starting magic link token processing');
    
    try {
        const response = await api.post('/auth/magic-link', { token });
        console.log(`[API] Magic link token processing completed in ${Date.now() - startTime}ms, status: ${response.status}`);
        return response.data;
    } catch (error) {
        console.error(`[API] Magic link token processing failed in ${Date.now() - startTime}ms:`, 
            error instanceof Error ? error.message : 'Unknown error');
        if (axios.isAxiosError(error) && error.response) {
            console.error('[API] Error response:', error.response.status, error.response.data);
            throw new Error(error.response.data?.message || 'Magic link authentication failed');
        }
        throw error instanceof Error ? error : new Error('Magic link authentication failed');
    }
};

export const setUserProgress = async (
  userId: string,
  progress: SetUserProgressRequest
): Promise<UserProgress> => {
  try {
    // Always use track ID from session storage, fallback to TRACK1
    const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';
    
    // Remove trackId from progress object since it's now in the URL
    const { trackId: _, ...progressWithoutTrackId } = progress;
    
    // Get user timezone and current date
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format

    const response = await api.post(`/users/${userId}/progress/${trackId}`, progressWithoutTrackId, {
      headers: {
        'X-User-Timezone': userTimezone,
        'X-User-Date': currentDate,
      }
    });
    return response.data;
  } catch (error) {
    console.error(`[API] setUserProgress failed:`, error instanceof Error ? error.message : 'Unknown error', 
      error instanceof AxiosError ? `status: ${error.response?.status}, data: ${JSON.stringify(error.response?.data)}` : '');
    throw error instanceof Error ? error : new Error('Failed to set user progress');
  }
};

export const getUserProgress = async (userId: string): Promise<GetProgressApiResponse> => {
  try {
    const response = await api.get(`/users/${userId}/progress`);
    if (!response.data) {
      throw new Error('No progress data received');
    }
    return response.data;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to fetch user progress');
  }
};

export const getTrackFacts = async (trackId?: string): Promise<Fact[]> => {
  try {
    // Use provided trackId or get from sessionStorage
    const currentTrackId = trackId || sessionStorage.getItem('activeTrackId') || 'TRACK1';
    
    const response = await api.get(`/trackFacts/track/${currentTrackId}`);
    
    if (!response.data?.success) {
      throw new Error('Failed to fetch track facts');
    }
    
    return response.data.facts;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to fetch track facts');
  }
};

export const getSession = async (
  userId: string, 
  activityType?: 'learn' | 'accuracyPractice' | 'fluencyPractice' | 'fluency6Practice' | 'fluency3Practice' | 'fluency2Practice' | 'fluency1_5Practice' | 'fluency1Practice' | 'all'
): Promise<GetSessionResponse> => {
  try {
    // Get the active track ID from session storage
    const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK5';
    
    // Track missing trackId in Sentry instead of console
    if (!sessionStorage.getItem('activeTrackId')) {
      logError(new Error('Missing trackId in sessionStorage'), {
        component: 'API-getSession',
        userId,
        fallbackTrackId: 'TRACK5',
        activityType,
        url: `session/${userId}/${trackId}`,
        location: window.location.pathname
      });
    }
    
    // Call the session endpoint with optional activityType parameter
    const response = await api.get(`/session/${userId}/${trackId}`, {
      params: activityType ? { activityType } : {}
    });
    
    if (!response.data) {
      throw new Error('No session data received');
    }
    
    return response.data;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to fetch session data');
  }
};

export const getTargetTime = async (userId: string): Promise<TargetTimeResponse> => {
  try {
    const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';
    const response = await api.get(`/targetTime/${userId}/${trackId}`);
    
    if (!response.data) {
      throw new Error('No target time data received');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error fetching target time:', error);
    // Return default fallback values if the API call fails
    return {
      timePerDigit: 0.5, // Default to grade 1 typing speed
      targetTime: 3
    };
  }
};

export const searchUsers = async (email: string): Promise<UserSearchResponse> => {
  try {
    const response = await api.get(`/admin/users/search?email=${encodeURIComponent(email)}`);
    if (!response.data) {
      throw new Error('Failed to search users');
    }
    return response.data;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to search users');
  }
};

export const getUserCQPM = async (): Promise<UserCQPMResponse> => {
  try {
    const response = await api.get('/admin/users/cqpm');
    if (!response.data) {
      throw new Error('Failed to get user CQPM data');
    }
    return response.data;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to get user CQPM data');
  }
};

export const getActiveStudents = async (): Promise<any> => {
  try {
    // This endpoint will return users with their session data already attached
    // and filtered to only include those active in the last 7 days
    const response = await api.get('/admin/users/active');
    if (!response.data) {
      throw new Error('Failed to get active students data');
    }
    return response.data;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to get active students data');
  }
};




export const createProgressAssessment = async (
  userId: string,
  duration: number,
  trackId: string
): Promise<string> => {
  try {
    // Get user timezone and current date
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
    
    const response = await api.post(`/progressAssessment/create/${userId}`, {
      trackId,
      duration
    }, {
      headers: {
        'X-User-Timezone': userTimezone,
        'X-User-Date': currentDate,
      }
    });

    if (!response.data?.success) {
      throw new Error('Failed to create progress assessment');
    }

    return response.data.assessmentId;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to create progress assessment');
  }
};

export const startProgressAssessment = async (
  userId: string
): Promise<ProgressAssessmentResponse> => {
  try {
    const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';
    
    // Get user timezone and current date
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
    
    const response = await api.post(`/progressAssessment/start/${userId}/${trackId}`, {}, {
      headers: {
        'X-User-Timezone': userTimezone,
        'X-User-Date': currentDate,
      }
    });

    if (!response.data?.success) {
      throw new Error('Failed to start progress assessment');
    }

    return response.data;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to start progress assessment');
  }
};

export const updateProgressAssessment = async (
  userId: string,
  assessmentId: string,
  facts: { [factId: string]: { attempts: number; correct: number; timeSpent: number } }
): Promise<ProgressAssessment> => {
  try {
    const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';
    
    // Get user timezone and current date
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
    
    const response = await api.post(
      `/progressAssessment/${assessmentId}/update/${trackId}/${userId}`,
      { facts },
      {
        headers: {
          'X-User-Timezone': userTimezone,
          'X-User-Date': currentDate,
        }
      }
    );

    if (!response.data?.success) {
      throw new Error('Failed to update progress assessment');
    }

    return response.data.assessment;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to update progress assessment');
  }
};

export const completeProgressAssessment = async (assessmentId: string, userId: string, timingData?: {
  totalTypingTimeDeducted: number;
  totalTransitionTime: number;
  actualDurationMinutes: number;
  testType?: 'TotalTimer' | 'QuestionTimer';
  clientSideStats?: {
    totalAttempts: number;
    totalCorrect: number;
  };
}): Promise<any> => {
  try {
    // Get user timezone and current date
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
    
    const response = await api.post(`/progressAssessment/${assessmentId}/complete/${userId}`, timingData, {
      headers: {
        'X-User-Timezone': userTimezone,
        'X-User-Date': currentDate,
      }
    });
    
    if (!response.data) {
      throw new Error('Invalid response from server');
    }
    
    return response.data.assessment;
  } catch (error) {
    console.error('Failed to complete progress assessment:', error);
    throw error;
  }
};

export const getUserProgressAssessments = async (userId: string): Promise<ProgressAssessment[]> => {
  try {
    const response = await api.get(`/progressAssessment/${userId}/assessments`);

    if (!response.data?.success) {
      throw new Error('Failed to fetch user assessments');
    }

    return response.data.assessments;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to fetch user assessments');
  }
};

export const getProgressMetrics = async (userId: string): Promise<ProgressMetrics> => {
  try {
    // Get the active track ID from session storage
    const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';
    
    // Track missing trackId in Sentry instead of console
    if (!sessionStorage.getItem('activeTrackId')) {
      logError(new Error('Missing trackId in sessionStorage'), {
        component: 'API-getProgressMetrics',
        userId,
        fallbackTrackId: 'TRACK1',
        location: window.location.pathname
      });
    }
    
    const response = await api.get(`/progressAssessment/${userId}/metrics`, {
      params: { trackId }
    });
    
    if (!response.data?.success) {
      throw new Error('Failed to fetch progress metrics');
    }
    
    return response.data.metrics;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to fetch progress metrics');
  }
};

export const updateTypingSpeed = async (
    userId: string,
    input: TypingSpeedInput
): Promise<TypingSpeedResponse> => {
    try {
        // Validate input before sending to prevent 400 errors
        if (!userId || !input || typeof input.count !== 'number' || typeof input.time !== 'number') {
            throw new Error('Invalid typing speed input data');
        }
        
        // Ensure values are positive and reasonable
        if (input.count <= 0 || input.time <= 0 || !isFinite(input.time)) {
            throw new Error(`Invalid typing speed values: count=${input.count}, time=${input.time}`);
        }
        
        const response = await api.post(`/users/${userId}/typing-speed`, input);
        
        if (!response.data) {
            throw new Error('No typing speed data received');
        }
        
        return response.data;
    } catch (error) {
        console.error(`[API] updateTypingSpeed failed:`, error instanceof Error ? error.message : 'Unknown error', 
            error instanceof AxiosError ? `status: ${error.response?.status}, data: ${JSON.stringify(error.response?.data)}` : '');
        if (error instanceof Error) {
            throw error;
        } else {
            throw new Error('Failed to update typing speed');
        }
    }
};

export const getTimeToCompletion = async (userId: string): Promise<TimeEstimationResponse> => {
  try {
    const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';
    const response = await api.get(`/timeEstimation/calculate`, {
      params: {
        userId,
        trackId
      }
    });
    
    if (!response.data) {
      throw new Error('No time estimation data received');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error fetching time estimation:', error);
    // Return default fallback value if the API call fails
    return {
      totalMinutes: 180 // Default to 3 hours (180 minutes)
    };
  }
};

export const recordPageTransition = async (
  data: {
    userId: string;
    trackId: string;
    page: PageType;
    factsByStage?: FactsByStage; // Add factsByStage parameter
  }
): Promise<{ success: boolean; sessionId?: string }> => {
  try {
    const response = await api.post('/sessionAnalytics/pageTransition', data);
    return response.data;
  } catch (error) {
    console.error('Error recording page transition:', error);
    return { success: false };
  }
};

export const getUserSessionAnalytics = async (userId: string): Promise<any> => {
  try {
    // Get recent session activity for this user without specifying date range
    // The backend will determine the appropriate date range 
    const response = await api.get('/sessionAnalytics', {
      params: { userId }
    });
    
    if (!response.data?.success) {
      throw new Error('Failed to fetch user session analytics');
    }
    
    // Also fetch the user's last activity (most recent session regardless of date)
    const lastSessionResponse = await api.get('/sessionAnalytics/lastActivity', {
      params: { userId }
    }).catch(err => {
      console.error('Error fetching last activity:', err);
      return { data: { success: false } };
    });
    
    // Include lastActivity in the response if available
    const result = response.data.data;
    
    if (lastSessionResponse?.data?.success && lastSessionResponse?.data?.lastActivity) {
      result.lastActivity = lastSessionResponse.data.lastActivity;
    }
    
    return result;
  } catch (error) {
    console.error('Error fetching session analytics:', error);
    throw error instanceof Error ? error : new Error('Failed to fetch session analytics');
  }
};

export const getUserSessionsLastWeek = async (userId: string): Promise<any> => {
  try {
    const response = await api.get('/sessionAnalytics/userSessionsLastWeek', {
      params: { userId }
    });
    
    if (!response.data?.success) {
      throw new Error('Failed to fetch user sessions from last week');
    }
    
    return response.data.data;
  } catch (error) {
    console.error('Error fetching user sessions from last week:', error);
    throw error instanceof Error ? error : new Error('Failed to fetch user sessions from last week');
  }
};

// Daily goals types
export interface DailyGoalsResponse {
  date: string;
  trackId: string;
  goals: {
    [goalType in 'learning' | 'accuracy' | 'fluency' | 'assessment']?: {
      total: number;
      completed: number;
    };
  };
  allCompleted: boolean;
}

export interface DailyGoalsApiResponse {
  success: boolean;
  data?: DailyGoalsResponse;
  message?: string;
}

// Get daily goals for a track
export const getDailyGoals = async (trackId: string): Promise<DailyGoalsApiResponse | DailyGoalsResponse> => {
  try {
    console.log(`[API] Fetching daily goals for track: ${trackId}`);
    
    // Get userId from token
    const token = localStorage.getItem('token');
    const decoded = token ? jwtDecode<{userId: string}>(token) : null;
    const userId = decoded?.userId;
    
    if (!userId) {
      throw new Error('User ID not found in token');
    }
    
    // Get user timezone and current date
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
    
    // Use direct axios call to bypass the global interceptor for this specific call
    const response = await axios.get(`${API_URL}/dailyGoals/${trackId}`, {
      params: { userId },
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-User-Timezone': userTimezone,
        'X-User-Date': currentDate,
      }
    });
    
    console.log('[API] Daily goals response:', response.data);
    
    if (!response.data) {
      throw new Error('No daily goals data received');
    }
    
    return response.data;
  } catch (error) {
    // Get token and userId again to ensure they're available in catch block
    const token = localStorage.getItem('token');
    const userId = token ? jwtDecode<{userId: string}>(token)?.userId : undefined;
    
    // Check if this is a 404 error, which is expected for new users/tracks
    const is404Error = error instanceof AxiosError && error.response?.status === 404;
    
    // Only log to Sentry if it's NOT a 404 error
    if (!is404Error) {
      // Log the error to Sentry with context
      logError(error, {
        component: 'API-getDailyGoals',
        trackId,
        userId,
        errorMsg: error instanceof Error ? error.message : 'Unknown error',
        responseData: error instanceof AxiosError ? JSON.stringify(error.response?.data || {}) : undefined,
        status: error instanceof AxiosError ? error.response?.status : undefined
      });
    } else {
      // Just log to console for 404s
      console.log(`[API] No daily goals found for track ${trackId} (404) - This is expected for new tracks`);
    }
    
    // Return a default empty response instead of throwing
    return {
      date: new Date().toISOString().split('T')[0],
      trackId,
      goals: {},
      allCompleted: false
    };
  }
};

// Update daily goal progress
export const updateDailyGoalProgress = async (
  trackId: string,
  goalType: 'learning' | 'accuracy' | 'fluency' | 'assessment',
  increment: number = 1
): Promise<DailyGoalsApiResponse | DailyGoalsResponse> => {
  try {
    console.log(`[API] Updating goal progress for track: ${trackId}, goalType: ${goalType}, increment: ${increment}`);
    
    // Get userId from token
    const token = localStorage.getItem('token');
    const decoded = token ? jwtDecode<{userId: string}>(token) : null;
    const userId = decoded?.userId;
    
    if (!userId) {
      throw new Error('User ID not found in token');
    }
    
    // Get user timezone and current date
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
    
    // Use direct axios call to bypass the global interceptor for this specific call
    const response = await axios.post(`${API_URL}/dailyGoals/${trackId}/progress`, 
      {
        userId,
        goalType,
        increment
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-User-Timezone': userTimezone,
          'X-User-Date': currentDate,
        }
      }
    );
    
    console.log('[API] Update goal progress response:', response.data);
    
    if (!response.data) {
      throw new Error('Failed to update daily goal progress');
    }
    
    return response.data;
  } catch (error) {
    // Get token and userId again to ensure they're available in catch block
    const token = localStorage.getItem('token');
    const userId = token ? jwtDecode<{userId: string}>(token)?.userId : undefined;
    
    // Check if this is a 404 error, which is expected for new users/tracks
    const is404Error = error instanceof AxiosError && error.response?.status === 404;
    
    // Only log to Sentry if it's NOT a 404 error
    if (!is404Error) {
      // Log the error to Sentry with context
      logError(error, {
        component: 'API-updateDailyGoalProgress',
        trackId,
        goalType,
        increment,
        userId,
        errorMsg: error instanceof Error ? error.message : 'Unknown error',
        responseData: error instanceof AxiosError ? JSON.stringify(error.response?.data || {}) : undefined,
        status: error instanceof AxiosError ? error.response?.status : undefined
      });
    } else {
      // Just log to console for 404s
      console.log(`[API] No daily goals found for track ${trackId} (404) - This is expected for new tracks`);
    }
    
    // Return the last state or a default empty response
    return {
      date: new Date().toISOString().split('T')[0],
      trackId,
      goals: {},
      allCompleted: false
    };
  }
};

/**
 * Updates a user's focusTrack to the next track
 * @param userId - The user's unique identifier
 * @returns Object with success status and optional message
 */
export const updateUserFocusTrack = async (userId: string): Promise<{success: boolean; message?: string}> => {
  try {
    const response = await api.put(`/users/${userId}/focus-track`, {});
    
    if (!response.data) {
      throw new Error('No response data received');
    }
    
    return response.data;
  } catch (error) {
    console.error('[API] updateUserFocusTrack failed:', error instanceof Error ? error.message : 'Unknown error',
      error instanceof AxiosError ? `status: ${error.response?.status}, data: ${JSON.stringify(error.response?.data)}` : '');
    throw error instanceof Error ? error : new Error('Failed to update user focus track');
  }
};

// Voice Input API Functions

export const createVoiceSession = async (
  userId: string,
  trackId: string
): Promise<VoiceSessionResponse> => {
  try {
    const response = await api.post('/voice/session', { userId, trackId });
    return response.data;
  } catch (error) {
    console.error('[API] createVoiceSession failed:', error);
    throw error instanceof Error ? error : new Error('Failed to create voice session');
  }
};

export const getVoiceToken = async (
  roomName: string,
  participantName: string
): Promise<VoiceTokenResponse> => {
  try {
    const response = await api.post('/voice/token', { roomName, participantName });
    return response.data;
  } catch (error) {
    console.error('[API] getVoiceToken failed:', error);
    throw error instanceof Error ? error : new Error('Failed to get voice token');
  }
};

export const joinVoiceRoom = async (
  roomName: string,
  userId: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const response = await api.post('/voice/join-room', { roomName, userId });
    return response.data;
  } catch (error) {
    console.error('[API] joinVoiceRoom failed:', error);
    throw error instanceof Error ? error : new Error('Failed to join voice room');
  }
};

export const endVoiceSession = async (
  sessionId: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const response = await api.post('/voice/end-session', { sessionId });
    return response.data;
  } catch (error) {
    console.error('[API] endVoiceSession failed:', error);
    throw error instanceof Error ? error : new Error('Failed to end voice session');
  }
};