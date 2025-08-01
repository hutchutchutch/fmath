export interface Question {
  id: string;
  num1: number;
  num2: number;
  operator: string;
  answer: number;
}

export interface Fact {
  PK: string;  // FACT#factId, eg. FACT#FACT12
  SK: string;  // METADATA
  factId: string;
  operation: 'addition' | 'subtraction' | 'multiplication' | 'division';
  operand1: number;
  operand2: number;
  result: number;
}

export interface Track {
  PK: string;  // TRACK#trackId, eg. TRACK#TRACK1
  SK: string;  // METADATA
  trackId: string;
  name: string;
  minFactId: string;
  maxFactId: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
      };
    }
  }
}