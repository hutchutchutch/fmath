import { api } from '../../config/api';
import { ProgressAssessmentResponse } from '../../types/progressAssessment';

interface TargetTimeResponse {
  timePerDigit: number;
  targetTime: number;
}

/**
 * Get target time for CQPM benchmark test
 */
export const getCQPMTargetTime = async (userId: string, trackId: string = 'TRACK5'): Promise<TargetTimeResponse> => {
  try {
    const response = await api.get(`/targetTime/${userId}/${trackId}`);
    
    if (!response.data) {
      throw new Error('No target time data received');
    }
    
    return response.data;
  } catch (error) {
    console.error('Error fetching CQPM target time:', error);
    // Return default fallback values if the API call fails
    return {
      timePerDigit: 0.5,
      targetTime: 3
    };
  }
};

/**
 * Start a progress assessment for CQPM benchmark
 */
export const startCQPMBenchmarkAssessment = async (
  userId: string,
  trackId: string = 'TRACK5'
): Promise<ProgressAssessmentResponse> => {
  try {
    const response = await api.post(`/progressAssessment/start/${userId}/${trackId}`);

    if (!response.data?.success) {
      throw new Error('Failed to start CQPM benchmark assessment');
    }

    return response.data;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to start CQPM benchmark assessment');
  }
};

/**
 * Update a progress assessment for CQPM benchmark
 */
export const updateCQPMBenchmarkAssessment = async (
  userId: string,
  assessmentId: string,
  facts: { [factId: string]: { attempts: number; correct: number; timeSpent: number } },
  trackId: string = 'TRACK5'
): Promise<any> => {
  try {
    const response = await api.post(
      `/progressAssessment/${assessmentId}/update/${trackId}/${userId}`,
      { facts }
    );

    if (!response.data?.success) {
      throw new Error('Failed to update CQPM benchmark assessment');
    }

    return response.data.assessment;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to update CQPM benchmark assessment');
  }
}; 