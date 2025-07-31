export type TrackStatus = 'not_started' | 'in_progress' | 'completed';
export type FactStatus = 
  | 'notStarted'
  | 'learning'           // Initial learning stage
  | 'accuracyPractice'   // Untimed practice for accuracy
  | 'fluency6Practice'   // 6s per question
  | 'fluency3Practice'   // 3s per question  
  | 'fluency2Practice'   // 2s per question
  | 'fluency1_5Practice' // 1.5s per question
  | 'fluency1Practice'   // 1s per question
  | 'mastered'           // Reached target fluency as per grade
  | 'automatic';         // Cleared the retention test at target fluency

export interface GetProgressApiResponse {
  userId: string;
  tracks: UserProgress[];
}

export interface FactProgress {
  status: FactStatus;
  attempts: number;
  correct: number;
  cqpm: number;
  accuracyRate: number;
  timeSpent: number;
  lastAttemptDate: string;
  // For accuracy practice
  accuracyProgress?: {
    streak: number;                      // How many consecutive days completed (0-3)
  };
  // For tracking today's attempts grouped by practice context
  todayStats?: {
    [practiceContext: string]: {
      date: string;                      // The date of these stats (ISO string)
      attempts: number;                  // Number of attempts today
      correct: number;                   // Number of correct attempts today
      timeSpent: number;                 // Time spent in milliseconds
      avgResponseTime?: number;          // Average response time in seconds
    };
  };
  // For retention testing
  retentionDay?: 1 | 3 | 7 | 16 | 35 | 75;  // Which scheduled retention day they're on
  nextRetentionDate?: string;               // The date when the next retention test is due
}

export interface UserProgress {
  PK: string;      // USER#userId
  SK: string;      // PROGRESS
  trackId: string;
  startDate: string;
  lastUpdated: string;
  status: TrackStatus;
  overallCQPM: number;
  accuracyRate: number;
  facts: {
    [factId: string]: FactProgress;
  };
}

export interface SetUserProgressRequest {
  trackId?: string;
  status?: TrackStatus;
  facts: {
    [factId: string]: Partial<Pick<FactProgress, 'status' | 'attempts' | 'correct' | 'timeSpent' | 'retentionDay' | 'nextRetentionDate'>> & {
      practiceContext?: string;
    };
  };
}
