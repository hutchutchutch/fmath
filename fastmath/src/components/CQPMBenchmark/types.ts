import { Question } from '../../types';

export type InputMethod = 'typing';
export type Screen = 'selection' | 'question' | 'result';

export interface Settings {
  inputMethod: InputMethod;
  questions: Question[];
  assessmentId: string;
  baseTime: number; // Base time in seconds for each question
  timePerDigit: number; // Time in seconds per digit for typing speed adjustment
  trackId: string; // The track ID (TRACK5 or TRACK6)
}

export interface BenchmarkResults {
  cqpm: number;
  totalQuestions: number;
  totalAttempted: number;
  correctAnswers: number;
  accuracy: number;
} 