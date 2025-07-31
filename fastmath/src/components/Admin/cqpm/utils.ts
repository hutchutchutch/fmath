import { WeeklyData, ChartData, ProcessedAssessmentResult } from './types';

/**
 * Format date for display
 */
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format datetime for display
 */
export const formatDateTime = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format percentage with 1 decimal place
 */
export const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

/**
 * Format CQPM score with 1 decimal place
 */
export const formatCqpm = (value: number): string => {
  return value.toFixed(1);
};

/**
 * Convert weekly data to Chart.js format
 */
export const convertToChartData = (weeklyData: WeeklyData[]): ChartData => {
  return {
    labels: weeklyData.map(week => week.weekLabel),
    datasets: [
      {
        label: 'Users Attempted',
        data: weeklyData.map(week => week.usersAttempted),
        backgroundColor: 'rgba(59, 130, 246, 0.8)', // Blue
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      },
      {
        label: 'Users Became Fluent',
        data: weeklyData.map(week => week.usersFluent),
        backgroundColor: 'rgba(34, 197, 94, 0.8)', // Green
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 1
      }
    ]
  };
};

/**
 * Get fluent status badge color classes
 */
export const getFluentBadgeClasses = (isFluent: boolean): string => {
  return isFluent
    ? 'bg-green-100 text-green-800 border-green-200'
    : 'bg-gray-100 text-gray-800 border-gray-200';
};

/**
 * Get fluent status display text
 */
export const getFluentDisplayText = (isFluent: boolean): string => {
  return isFluent ? 'Yes' : 'No';
};

/**
 * Sort assessment results by date (newest first)
 */
export const sortAssessmentsByDate = (
  results: ProcessedAssessmentResult[]
): ProcessedAssessmentResult[] => {
  return [...results].sort((a, b) => 
    new Date(b.scoreDate).getTime() - new Date(a.scoreDate).getTime()
  );
};

/**
 * Filter assessments by search term (email or assessment type)
 */
export const filterAssessments = (
  results: ProcessedAssessmentResult[],
  searchTerm: string
): ProcessedAssessmentResult[] => {
  if (!searchTerm.trim()) return results;
  
  const term = searchTerm.toLowerCase();
  return results.filter(result => 
    result.userEmail.toLowerCase().includes(term) ||
    result.assessmentType.toLowerCase().includes(term)
  );
};

/**
 * Paginate array
 */
export const paginateArray = <T>(
  array: T[],
  currentPage: number,
  itemsPerPage: number
): T[] => {
  const startIndex = (currentPage - 1) * itemsPerPage;
  return array.slice(startIndex, startIndex + itemsPerPage);
};

/**
 * Calculate total pages for pagination
 */
export const calculateTotalPages = (
  totalItems: number,
  itemsPerPage: number
): number => {
  return Math.ceil(totalItems / itemsPerPage);
};

/**
 * Get CQPM performance color (for progress bars, etc.)
 */
export const getCqpmColor = (cqpm: number): string => {
  if (cqpm >= 80) return 'text-green-600';
  if (cqpm >= 60) return 'text-yellow-600';
  if (cqpm >= 40) return 'text-orange-600';
  return 'text-red-600';
};

/**
 * Get CQPM background color
 */
export const getCqpmBgColor = (cqpm: number): string => {
  if (cqpm >= 80) return 'bg-green-100';
  if (cqpm >= 60) return 'bg-yellow-100';
  if (cqpm >= 40) return 'bg-orange-100';
  return 'bg-red-100';
};

/**
 * Get accuracy rate color classes
 */
export const getAccuracyColor = (accuracyRate: number): string => {
  if (accuracyRate >= 90) return 'text-green-600';
  if (accuracyRate >= 80) return 'text-yellow-600';
  if (accuracyRate >= 70) return 'text-orange-600';
  return 'text-red-600';
};

/**
 * Debounce function for search
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Export data to CSV
 */
export const exportToCSV = (
  data: ProcessedAssessmentResult[],
  filename: string = 'cqpm_data.csv'
): void => {
  const headers = [
    'User Email',
    'Assessment Type', 
    'CQPM Score',
    'Accuracy Rate (%)',
    'Correct Answers',
    'Total Attempts',
    'Fluent Status',
    'Score Date',
    'Last Modified'
  ];

  const csvData = [
    headers,
    ...data.map(result => [
      result.userEmail,
      result.assessmentType,
      formatCqpm(result.cqpm),
      formatPercentage(result.accuracyRate),
      result.correct.toString(),
      result.attempts.toString(),
      getFluentDisplayText(result.fluent),
      formatDate(result.scoreDate),
      formatDate(result.dateLastModified)
    ])
  ];

  const csvContent = csvData
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};