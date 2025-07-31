import { useState, useEffect, useCallback } from 'react';
import { getCqpmDashboardData } from '../../../../api/admin';
import { CqpmDashboardData, LoadingState, DateRangeOption } from '../types';

/**
 * Custom hook for managing CQPM dashboard data
 */
export const useCqpmData = (initialDays: DateRangeOption = 30) => {
  const [data, setData] = useState<CqpmDashboardData | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: true,
    error: null
  });
  const [dateRange, setDateRange] = useState<DateRangeOption>(initialDays);

  /**
   * Fetch dashboard data
   */
  const fetchData = useCallback(async (days: DateRangeOption) => {
    setLoadingState({ isLoading: true, error: null });

    try {
      console.log(`Fetching CQPM data for ${days} days`);
      const response = await getCqpmDashboardData(days);
      
      if (response.success && response.data) {
        setData(response.data);
        setLoadingState({ isLoading: false, error: null });
      } else {
        throw new Error(response.message || 'Failed to fetch CQPM data');
      }
    } catch (error) {
      console.error('Error fetching CQPM data:', error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred while fetching CQPM data';

      setLoadingState({ isLoading: false, error: errorMessage });
      setData(null);
    }
  }, []);

  /**
   * Change date range and refetch data
   */
  const changeDateRange = useCallback((newRange: DateRangeOption) => {
    if (newRange !== dateRange) {
      setDateRange(newRange);
      fetchData(newRange);
    }
  }, [dateRange, fetchData]);

  /**
   * Refresh current data
   */
  const refreshData = useCallback(() => {
    fetchData(dateRange);
  }, [dateRange, fetchData]);

  /**
   * Initial data fetch
   */
  useEffect(() => {
    fetchData(dateRange);
  }, []); // Only run on mount

  return {
    // Data
    data,
    dateRange,
    
    // Loading states
    isLoading: loadingState.isLoading,
    error: loadingState.error,
    
    // Actions
    changeDateRange,
    refreshData,
    
    // Derived values
    hasData: data !== null,
    hasError: loadingState.error !== null
  };
};