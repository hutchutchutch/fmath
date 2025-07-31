// OneRoster Assessment Result from API response
export interface OneRosterAssessmentResultAPI {
  sourcedId: string;
  status: string;
  dateLastModified: string;
  metadata: {
    cqpm: number;
    fluent: string;
    correct: number;
    attempts: number;
    accuracyRate: number;
  };
  assessmentLineItem: {
    sourcedId: string;
  };
  student: {
    sourcedId: string;
  };
  score: number;
  scoreDate: string;
  scoreStatus: string;
  inProgress: string;
  incomplete: string;
  late: string;
  missing: string;
}

// OneRoster API Response
export interface OneRosterAssessmentResponse {
  assessmentResults: OneRosterAssessmentResultAPI[];
}

// Processed assessment result with user email
export interface ProcessedAssessmentResult {
  sourcedId: string;
  userEmail: string;
  cqpm: number;
  accuracyRate: number;
  correct: number;
  attempts: number;
  fluent: boolean;
  scoreDate: string;
  dateLastModified: string;
  assessmentType: string;
}

// Weekly aggregated data for charts
export interface WeeklyData {
  weekStart: string; // ISO date string for start of week
  weekLabel: string; // Human readable label like "Jan 15-21"
  usersAttempted: number; // Unique users who attempted at least 1 assessment
  usersFluent: number; // Unique users who became fluent
}

// User ranking data
export interface UserRanking {
  userEmail: string;
  fluentCount: number; // Number of assessments where fluent = "Yes"
  totalAssessments: number;
  fluentPercentage: number;
  averageCqpm: number;
  lastActivity: string; // Most recent scoreDate
}

// Summary statistics
export interface SummaryStats {
  totalAssessments: number;
  totalUsers: number;
  averageCqpm: number;
  fluentPercentage: number; // Percentage of assessments where fluent = "Yes"
  mostActiveAssessmentType: string;
}

// Complete dashboard data response
export interface CqpmDashboardData {
  weeklyData: WeeklyData[];
  assessmentResults: ProcessedAssessmentResult[];
  userRankings: UserRanking[];
  summaryStats: SummaryStats;
  dateRange: {
    startDate: string;
    endDate: string;
    days: number;
  };
}

// API request interface
export interface CqpmDashboardRequest {
  days?: number; // 30, 60, or 90 days (default: 30)
}

// User profile interface for database lookups
export interface UserProfileForCqpm {
  userId: string;
  email: string;
  oneRosterSourcedId?: string;
}