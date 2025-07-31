import { Question } from '.';

export type AssessmentStatus = 'assigned' | 'in_progress' | 'completed';
export type AssessmentType = 'progress' | 'placement';

export interface FactScore {
  attempts: number;
  correct: number;
  cqpm: number;
  accuracyRate: number;
  timeSpent: number;
  // Question data
  num1: number;
  num2: number;
  operator: string;
  answer: number;
}

export interface ProgressAssessment {
  PK: string; // USER#userId
  SK: string; // PROGRESSASSESSMENT#assessmentId
  assessmentId: string;
  startDate: string;
  lastUpdated: string;
  status: AssessmentStatus;
  overallCQPM: number;
  accuracyRate: number;
  trackId: string;  // Changed to string since it's already in format TRACK2
  duration: number; // in minutes
  facts: Record<string, FactScore>;
  testType?: 'TotalTimer' | 'QuestionTimer'; // Track which question screen type was used
}

// New types for handling updates
export interface FactUpdate {
  attempts: number;
  correct: number;
  timeSpent: number;
}

export interface ProgressAssessmentUpdate {
  assessmentId: string;
  facts: {
    [factId: string]: FactUpdate;
  };
}

export interface TimingMetadata {
  totalTypingTimeDeducted: number;
  totalTransitionTime: number;
  actualDurationMinutes: number;
  testType?: 'TotalTimer' | 'QuestionTimer';
  clientSideStats?: {
    totalAttempts: number;
    totalCorrect: number;
  }
}

export interface ProgressAssessmentResponse {
  assessmentId: string;
  questions: Question[];
}