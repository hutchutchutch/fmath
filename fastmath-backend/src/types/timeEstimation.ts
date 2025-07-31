// Types for Time Estimation Service

// Grade-specific error factor for time calculation
export interface GradeErrorFactor {
  // Multiplier to account for mistakes and reattempts
  errorFactor: number;
}

// Time for each learning stage (in seconds)
export interface StageTimeParameters {
  learning: number;
  accuracyPractice: number;
  fluency6Practice: number;
  fluency3Practice: number;
  fluency2Practice: number;
  fluency1_5Practice: number;
  fluency1Practice: number;
  mastered: number; // For retention
}

// Request parameters for time estimation
export interface TimeEstimationRequest {
  userId: string;
  trackId: string;
  dailyPracticeMinutes?: number; // Optional, can be provided by frontend
}

// Response for time estimation
export interface TimeEstimationResponse {
  totalMinutes: number;
}

// Fact counts by status
export interface FactStatusCounts {
  notStarted: number;
  learning: number;
  accuracyPractice: number;
  fluency6Practice: number;
  fluency3Practice: number;
  fluency2Practice: number;
  fluency1_5Practice: number;
  fluency1Practice: number;
  mastered: number;
  automatic: number;
} 