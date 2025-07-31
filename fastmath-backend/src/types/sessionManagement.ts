import { Fact } from '.';

export interface GetSessionRequest {
  userId: string;
  trackId: string;
  activityType?: SessionActivity | 'all';
}

export type SessionActivity = 
  | 'learn' 
  | 'accuracyPractice' 
  | 'fluencyPractice' 
  | 'fluency6Practice' 
  | 'fluency3Practice' 
  | 'fluency2Practice'
  | 'fluency1_5Practice' 
  | 'fluency1Practice' 
  | 'assessment' 
  | 'complete';
export type FluencyLevel = '6s' | '3s' | '2s' | '1.5s' | '1s';

export interface GetSessionResponse {
  // Multiple activities can be available
  availableActivities: {
    learn?: {
      facts: Fact[];
    };
    accuracyPractice?: {
      facts: Fact[];
    };
    fluencyPractice?: {
      // For general fluencyPractice activity, return facts grouped by level
      groupedFacts?: {
        [key in FluencyLevel]?: Fact[];
      };
      // For specific fluency level activities, return facts and level
      facts?: Fact[];
      fluencyLevel?: FluencyLevel;
    };
  };
  // Assessment flags
  progressAssessment: boolean;
  dailyAssessmentCount: number; // Count of progress assessments taken today
}

// Interface for facts with their progress status
export interface FactWithProgress extends Fact {
  progressStatus: string;
  lastAttemptDate?: string; // When the fact was last attempted
  accuracyStreak?: number; // Accuracy practice streak (0-3)
  retentionDay?: 1 | 3 | 7 | 16 | 35 | 75; // Which scheduled retention day they're on
  nextRetentionDate?: string; // The date when the next retention test is due
} 