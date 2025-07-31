// Frontend TypeScript interfaces for CQPM Dashboard

// Processed assessment result from backend
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
  fluentCount: number; // Number of assessments where fluent = true
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
  fluentPercentage: number; // Percentage of assessments where fluent = true
  mostActiveAssessmentType: string;
}

// Complete dashboard data response from API
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

// API response wrapper
export interface CqpmApiResponse {
  success: boolean;
  data: CqpmDashboardData;
  message?: string;
  error?: string;
}

// Date range options
export type DateRangeOption = 30 | 60 | 90;

// Chart data structure for Chart.js
export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor: string;
    borderColor?: string;
    borderWidth?: number;
  }[];
}

// Table pagination props
export interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

// Loading and error states
export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

// User details modal data
export interface UserDetailsModalData {
  userEmail: string;
  assessmentResults: ProcessedAssessmentResult[];
  ranking?: UserRanking;
  dateRange: {
    startDate: string;
    endDate: string;
    days: number;
  };
}