export interface SessionData {
  PK: string;                // USER#userId#SESSION#sessionId
  SK: string;                // SESSION#trackId (Corrected from TRACK#trackId in original comment)
  userId: string;            // User identifier
  sessionId: string;         // Unique ID for the session
  trackId: string;           // Track being studied
  
  // Session timing
  startTime: string;         // ISO date string
  endTime: string;           // ISO date string
  totalDuration: number;     // Total session duration in seconds
  
  // Activity timing breakdown
  learningTime: number;      // Time spent in learning activities (seconds)
  accuracyPracticeTime: number; // Time spent in accuracy practice (seconds)
  // Add separate timing for each fluency level
  fluency6PracticeTime?: number;  // Time spent in 6-second fluency practice (seconds)
  fluency3PracticeTime?: number;  // Time spent in 3-second fluency practice (seconds)
  fluency2PracticeTime?: number;  // Time spent in 2-second fluency practice (seconds)
  fluency1_5PracticeTime?: number; // Time spent in 1.5-second fluency practice (seconds)
  fluency1PracticeTime?: number;   // Time spent in 1-second fluency practice (seconds)
  assessmentTime: number;    // Time spent in assessments (seconds)
  otherTime: number;         // Time spent in other activities (seconds)
  
  // Page transitions
  pageTransitions: PageTransition[];
  
  // Fact-specific tracking using the new type
  factsCovered?: {
    learning: FactWithStatusTracking[];
    accuracyPractice: FactWithStatusTracking[];
    fluency6Practice: FactWithStatusTracking[];
    fluency3Practice: FactWithStatusTracking[];
    fluency2Practice: FactWithStatusTracking[];
    fluency1_5Practice: FactWithStatusTracking[];
    fluency1Practice: FactWithStatusTracking[];
  };
  
  // Caliper metrics - accumulated as sent to Caliper
  totalActiveTime?: number;      // Total active time in seconds
  totalWasteTime?: number;       // Total waste time in seconds  
  totalXpEarned?: number;        // Total XP earned
  totalQuestions?: number;       // Total questions attempted
  correctQuestions?: number;     // Total correct answers
  
  // Version number for optimistic locking
  version?: number;
}

export interface PageTransition {
  timestamp: string;       // ISO date string
  page: PageType;          // Page the user is on
  factsByStage?: FactsByStage; // Keep original definition for incoming request data if needed
  trackId: string;
}

// Define a reusable type for fact stages (often used in incoming requests)
export type FactsByStage = {
  [key in (ActivityType | 'fluency6Practice' | 'fluency3Practice' | 'fluency2Practice' | 'fluency1_5Practice' | 'fluency1Practice')]?: string[];
};

export type ActivityType = 'learning' | 'accuracyPractice' | 'fluencyPractice' | 'assessment' | 'onboarding' | 'other';
export type PageType = 'dashboard' | 'learn' | 'practice' | 'timed-practice' | 'accuracy-practice' | 'fluency-practice' | 'assessment' | 'onboarding' | 'other';

export interface PageTransitionRequest {
  userId: string;
  trackId: string;
  page: PageType;
  factsByStage?: FactsByStage;
}

export interface SessionAnalyticsResponse {
  success: boolean;
  message?: string;
  sessionId?: string;
  data?: any;
}

export interface SessionAnalyticsQueryParams {
  userId: string;
  trackId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface SessionAnalyticsAggregateResponse {
  totalTimeSpent: number;
  timeByActivity: {
    learningTime: number;
    accuracyPracticeTime: number;
    // Add separate timing for each fluency level
    fluency6PracticeTime: number;
    fluency3PracticeTime: number;
    fluency2PracticeTime: number;
    fluency1_5PracticeTime: number;
    fluency1PracticeTime: number;
    assessmentTime: number;
    otherTime: number;
  };
  averageTimePerIteration?: {
    learning?: number;
    accuracyPractice?: number;
    fluency6Practice?: number;
    fluency3Practice?: number;
    fluency2Practice?: number;
    fluency1_5Practice?: number;
    fluency1Practice?: number;
  };
  // Include Caliper metrics in aggregations
  totalActiveTime: number;
  totalWasteTime: number;
  totalXpEarned: number;
  totalQuestions: number;
  correctQuestions: number;
}

// Add a new type for tracking fact status
export interface FactWithStatusTracking {
  factId: string;
  initialStatus?: string; // Status when first encountered in the session for this stage
  statusChanged?: boolean; // Did the status change during this session segment?
  trackId?: string;
} 