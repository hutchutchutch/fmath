import { Question } from './index';

export type AssessmentStatus = 'assigned' | 'in_progress' | 'completed';

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
  SK: string; // ASSESSMENT#assessmentId
  assessmentId: string;
  assessmentType: 'progress';
  startDate: string;
  lastUpdated: string;
  status: AssessmentStatus;
  overallCQPM: number;
  accuracyRate: number;
  trackId: string;
  duration: number; // in minutes
  facts: Record<string, FactScore>;
}

export interface ProgressAssessmentResponse {
  assessmentId: string;
  questions: Question[];
}

export interface FactUpdate {
  attempts: number;
  correct: number;
  timeSpent: number;
} 