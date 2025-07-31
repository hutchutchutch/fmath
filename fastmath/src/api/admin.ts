import { AxiosError } from 'axios';
import { api } from './apiClient';

/**
 * Get all users data for CSV download
 * @returns JSON response with users data that can be converted to CSV
 */
export const getAllUsersForDownload = async (): Promise<{success: boolean; users: any[]}> => {
  try {
    const response = await api.get('/admin/downloads/users');
    
    if (!response.data || !response.data.success) {
      throw new Error('Failed to get users data for download');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error downloading users data:', error);
    throw error instanceof Error ? error : new Error('Failed to download users data');
  }
};

/**
 * Get all sessions within a date range for CSV download
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns JSON response with sessions data that can be converted to CSV
 */
export const getSessionsForDownload = async (
  startDate: string, 
  endDate: string
): Promise<{success: boolean; sessions: any[]}> => {
  try {
    const response = await api.get('/admin/downloads/sessions', {
      params: { startDate, endDate }
    });
    
    if (!response.data || !response.data.success) {
      throw new Error('Failed to get sessions data for download');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error downloading sessions data:', error);
    throw error instanceof Error ? error : new Error('Failed to download sessions data');
  }
};

/**
 * Get all daily goals within a date range for CSV download
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns JSON response with daily goals data that can be converted to CSV
 */
export const getDailyGoalsForDownload = async (
  startDate: string, 
  endDate: string
): Promise<{success: boolean; goals: any[]}> => {
  try {
    const response = await api.get('/admin/downloads/daily-goals', {
      params: { startDate, endDate }
    });
    
    if (!response.data || !response.data.success) {
      throw new Error('Failed to get daily goals data for download');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error downloading daily goals data:', error);
    throw error instanceof Error ? error : new Error('Failed to download daily goals data');
  }
};

/**
 * Get user progress data across all tracks for CSV download
 * @param userId - Optional user ID to filter by
 * @returns JSON response with progress data that can be converted to CSV
 */
export const getUserProgressForDownload = async (
  userId?: string
): Promise<{success: boolean; progress: any[]}> => {
  try {
    const response = await api.get('/admin/downloads/user-progress', {
      params: userId ? { userId } : {}
    });
    
    if (!response.data || !response.data.success) {
      throw new Error('Failed to get user progress data for download');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error downloading user progress data:', error);
    throw error instanceof Error ? error : new Error('Failed to download user progress data');
  }
};

/**
 * Create new users through roster import
 * @param userData - Array of user data objects to create
 * @returns JSON response with creation results
 */
export const createUsers = async (
  userData: any[]
): Promise<{
  success: boolean; 
  message: string;
  results?: {
    totalProcessed: number;
    created: number;
    alreadyExisting: number;
    failed: number;
    details: Array<{
      email: string;
      userId?: string;
      status: string;
      oneRosterStatus?: string;
      message?: string;
    }>;
  };
}> => {
  try {
    const response = await api.post('/admin/user-rostering/create', {
      users: userData
    });
    
    if (!response.data || !response.data.success) {
      throw new Error('Failed to create users');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error creating users:', error);
    throw error instanceof Error ? error : new Error('Failed to create users');
  }
};

/**
 * Update multiple users' grades in a batch
 * @param updates - Array of objects with email and grade
 * @returns Response with success status and results
 */
export const updateUserGradesBatch = async (
  updates: { email: string; grade: number }[]
): Promise<{ 
  success: boolean; 
  message: string; 
  results?: Array<{
    email: string;
    success: boolean;
    message: string;
    userId?: string;
  }>;
}> => {
  try {
    const response = await api.put('/admin/users/grades/batch', { updates });
    
    return response.data;
  } catch (error) {
    console.error('Error batch updating user grades:', error);
    if (error instanceof AxiosError && error.response) {
      return error.response.data;
    }
    throw error instanceof Error ? error : new Error('Failed to batch update user grades');
  }
};

/**
 * Update multiple users' tracks in a batch
 * @param updates - Array of objects with email and track
 * @returns Response with success status and results
 */
export const updateUserTracksBatch = async (
  updates: { email: string; track: string }[]
): Promise<{ 
  success: boolean; 
  message: string; 
  results?: Array<{
    email: string;
    success: boolean;
    message: string;
    userId?: string;
  }>;
}> => {
  try {
    const response = await api.put('/admin/users/tracks/batch', { updates });
    
    return response.data;
  } catch (error) {
    console.error('Error batch updating user tracks:', error);
    if (error instanceof AxiosError && error.response) {
      return error.response.data;
    }
    throw error instanceof Error ? error : new Error('Failed to batch update user tracks');
  }
};

/**
 * Reset a user's progress for a specific track.
 * @param email - The email of the user to reset.
 * @param trackId - The track to reset progress for.
 * @returns Response with success status and message.
 */
export const resetUserProgress = async (
  email: string,
  trackId: string
): Promise<{ 
  success: boolean; 
  message: string; 
}> => {
  try {
    const response = await api.post('/admin/users/progress/reset', { email, trackId });
    
    return response.data;
  } catch (error) {
    console.error('Error resetting user progress:', error);
    if (error instanceof AxiosError && error.response) {
      return error.response.data;
    }
    throw error instanceof Error ? error : new Error('Failed to reset user progress');
  }
};

/**
 * Get CQPM dashboard data for the specified date range
 * @param days - Number of days to look back (30, 60, or 90)
 * @returns Response with CQPM dashboard data
 */
export const getCqpmDashboardData = async (
  days: number = 30
): Promise<{
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}> => {
  try {
    const response = await api.get('/admin/cqpm/dashboard-data', {
      params: { days }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching CQPM dashboard data:', error);
    if (error instanceof AxiosError && error.response) {
      return error.response.data;
    }
    throw error instanceof Error ? error : new Error('Failed to fetch CQPM dashboard data');
  }
};

/**
 * Get individual user CQPM details
 * @param email - User email to get details for
 * @param days - Number of days to look back (30, 60, or 90)
 * @returns Response with user-specific CQPM data
 */
export const getUserCqpmDetails = async (
  email: string,
  days: number = 30
): Promise<{
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}> => {
  try {
    const response = await api.get(`/admin/cqpm/user-details/${encodeURIComponent(email)}`, {
      params: { days }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching user CQPM details:', error);
    if (error instanceof AxiosError && error.response) {
      return error.response.data;
    }
    throw error instanceof Error ? error : new Error('Failed to fetch user CQPM details');
  }
};

/**
 * Get all progress assessments within a date range for CSV download
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns JSON response with progress assessments data that can be converted to CSV
 */
export const getProgressAssessmentsForDownload = async (
  startDate: string, 
  endDate: string
): Promise<{success: boolean; assessments: any[]}> => {
  try {
    const response = await api.get('/admin/downloads/progress-assessments', {
      params: { startDate, endDate }
    });
    
    if (!response.data || !response.data.success) {
      throw new Error('Failed to get progress assessments data for download');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error downloading progress assessments data:', error);
    throw error instanceof Error ? error : new Error('Failed to download progress assessments data');
  }
}; 