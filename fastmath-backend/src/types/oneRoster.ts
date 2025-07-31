export interface OneRosterUser {
  sourcedId: string;
  status: string;
  userMasterIdentifier: string;
  username: string;
  enabledUser: boolean;
  givenName: string;
  familyName: string;
  middleName: null;
  email: string;
  roles: {
    roleType: string;
    role: string;
    org: {
      sourcedId: string;
    };
  }[];
}

export interface CreateOneRosterUserResult {
  success: boolean;
  message: string;
  userId?: string;
  enrolledClasses?: string[];
  errors?: any[];
  existingUser?: boolean;
  oneRosterSourcedId?: string;
}

export interface UserProfile {
  PK: string;
  SK: string;
  email: string;
  name?: string;
  focusTrack?: string;
  [key: string]: any; // For other properties
}

// Grade-based class names
export const GRADE_CLASS_NAMES = {
  GRADE_1: 'fastmath-grade-1-class',
  GRADE_2: 'fastmath-grade-2-class', 
  GRADE_3: 'fastmath-grade-3-class',
  GRADE_4: 'fastmath-grade-4-class'
} as const;

// Map of track IDs to grade-based class names
export const TRACK_TO_CLASS_MAP: Record<string, string> = {
  // Deprecated tracks - map to grade 4 for backward compatibility
  'TRACK1': GRADE_CLASS_NAMES.GRADE_4,
  'TRACK2': GRADE_CLASS_NAMES.GRADE_4,
  'TRACK3': GRADE_CLASS_NAMES.GRADE_4,
  'TRACK4': GRADE_CLASS_NAMES.GRADE_4,
  // Current tracks mapped to appropriate grades
  'TRACK5': GRADE_CLASS_NAMES.GRADE_4,  // Division Facts (Up to 12) - Grade 4
  'TRACK6': GRADE_CLASS_NAMES.GRADE_3,  // Addition Facts (Sums up to 20) - Grade 3
  'TRACK7': GRADE_CLASS_NAMES.GRADE_4,  // Multiplication Facts (Factors up to 12) - Grade 4
  'TRACK8': GRADE_CLASS_NAMES.GRADE_3,  // Subtraction Facts (Up to 20) - Grade 3
  'TRACK9': GRADE_CLASS_NAMES.GRADE_2,  // Addition (Single-Digit) - Grade 2
  'TRACK10': GRADE_CLASS_NAMES.GRADE_2, // Subtraction (Single-Digit) - Grade 2
  'TRACK11': GRADE_CLASS_NAMES.GRADE_3, // Multiplication (Single-digit) - Grade 3
  'TRACK12': GRADE_CLASS_NAMES.GRADE_1  // Addition Within 10 (Sums up to 10) - Grade 1
};

// Default class name for initial enrollment (Grade 1)
export const DEFAULT_INITIAL_CLASS = GRADE_CLASS_NAMES.GRADE_1;

// Class name for users with ALL access (highest grade)
export const ALL_ACCESS_CLASS = GRADE_CLASS_NAMES.GRADE_4;

// Single class name for all FastMath users (deprecated - use grade-based classes)
export const FASTMATH_CLASS_NAME = 'fastmath-class';

// Interface to define the data needed for Caliper event
export interface CaliperEventData {
  userId: string;
  sessionId: string;
  learningFactsCount?: number;
  accuracyPracticeFactsCount?: number;
  fluencyPracticeFactsCount?: number;
  assessmentFactsCount?: number;
  learningTimeSpent?: number;
  accuracyPracticeTimeSpent?: number;
  fluencyPracticeTimeSpent?: number;
  assessmentTimeSpent?: number;
  eventTime?: string; // Optional, will use current time if not provided
}

// Interface for assessment result metadata
export interface AssessmentResultMetadata {
  cqpm?: number;
  accuracyRate?: number;
  attempts?: number;
  correct?: number;
  fluent?: string;
  [key: string]: any; // Allow for additional metadata fields
}

// Interface for assessment result submission to OneRoster
export interface OneRosterAssessmentResult {
  sourcedId: string;
  status: string;
  assessmentLineItem: {
    sourcedId: string;
  };
  student: {
    sourcedId: string;
  };
  score: number;
  scoreDate: string;
  scoreStatus: string;
  metadata?: AssessmentResultMetadata;
}

// OneRoster assessment result API response
export interface OneRosterAssessmentResultResponse {
  sourcedIdPairs: {
    suppliedSourcedId: string;
    allocatedSourcedId: string;
  };
}

// Interface for assessment result submission response
export interface CreateAssessmentResultResponse {
  success: boolean;
  message: string;
  sourcedId?: string;
  allocatedSourcedId?: string;
  error?: any;
} 