export interface LearningFact {
  operation: 'addition' | 'subtraction' | 'multiplication' | 'division';
  num1: number;
  num2: number;
  result: number;
  level?: number;
}

export interface LearningProgress {
  factsLearned: number;
  currentLevel: number;
  lastPracticedAt: Date;
}

export interface Fact {
  PK: string;
  SK: string;
  operation: 'addition' | 'subtraction' | 'multiplication' | 'division';
  operand1: number;
  operand2: number;
  result: number;
  factId: string;
} 