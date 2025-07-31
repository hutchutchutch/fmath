import React, { useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { FiRefreshCw, FiUsers, FiTrendingUp, FiTarget, FiBarChart } from 'react-icons/fi';
import Logo from '../../common/Logo';

// Import CQPM components
import { DateRangeSelector } from './DateRangeSelector';
import { WeeklyActivityChart } from './WeeklyActivityChart';
import { AssessmentResultsTable } from './AssessmentResultsTable';
import { FluentUsersRanking } from './FluentUsersRanking';
import { useCqpmData } from './hooks/useCqpmData';
import { formatCqpm, formatPercentage } from './utils';

// Access denied component for non-admin users
const AccessDenied = () => (
  <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
    <div className="max-w-4xl mx-auto text-center">
      <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
      <p className="text-base text-gray-600 mt-2">You are not authorized to view this page.</p>
    </div>
  </div>
);

// Header component
const CqpmDashboardHeader = () => (
  <h1 className="text-4xl font-bold text-center pt-8 mb-6 flex items-center justify-center gap-4">
    <Logo size={32} />
    <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
      CQPM Analytics Dashboard
    </span>
  </h1>
);

// Summary stats component
interface SummaryStatsProps {
  totalAssessments: number;
  totalUsers: number;
  averageCqpm: number;
  fluentPercentage: number;
  mostActiveAssessmentType: string;
  isLoading?: boolean;
}

const SummaryStats: React.FC<SummaryStatsProps> = ({
  totalAssessments,
  totalUsers,
  averageCqpm,
  fluentPercentage,
  mostActiveAssessmentType,
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-lg border border-gray-100">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-300 rounded mb-2"></div>
                <div className="h-8 bg-gray-300 rounded mb-2"></div>
                <div className="h-3 bg-gray-300 rounded w-2/3"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const stats = [
    {
      title: 'Total Assessments',
      value: totalAssessments.toLocaleString(),
      icon: FiBarChart,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Active Students',
      value: totalUsers.toLocaleString(),
      icon: FiUsers,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Average CQPM',
      value: formatCqpm(averageCqpm),
      icon: FiTrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Fluent Rate',
      value: formatPercentage(fluentPercentage),
      icon: FiTarget,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat, index) => (
        <Card key={index} className="shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
                <p className={`text-3xl font-bold ${stat.color}`}>
                  {stat.value}
                </p>
                {stat.title === 'Fluent Rate' && mostActiveAssessmentType !== 'N/A' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Most active: {mostActiveAssessmentType}
                  </p>
                )}
              </div>
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Error component
interface ErrorDisplayProps {
  error: string;
  onRetry: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry }) => (
  <Card className="shadow-lg border border-red-100">
    <CardContent className="p-8 text-center">
      <div className="text-red-400 mb-4">⚠️</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Dashboard</h3>
      <p className="text-gray-600 mb-4">{error}</p>
      <Button onClick={onRetry} className="bg-red-600 hover:bg-red-700 text-white">
        <FiRefreshCw className="w-4 h-4 mr-2" />
        Try Again
      </Button>
    </CardContent>
  </Card>
);

// Main CQPM Dashboard Component
export const CqpmDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  
  // Check if user is admin (same logic as other admin pages)
  const isAdmin = useMemo(() => 
    currentUser?.userId === 'a24ab5cd-4209-41f0-9806-65ae0a9e6957', 
    [currentUser?.userId]
  );

  // Use custom hook for data management
  const {
    data,
    dateRange,
    isLoading,
    error,
    hasError,
    changeDateRange,
    refreshData
  } = useCqpmData();

  // Early return if not admin
  if (!isAdmin) {
    return <AccessDenied />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <CqpmDashboardHeader />

        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <DateRangeSelector
            selectedRange={dateRange}
            onRangeChange={changeDateRange}
            isLoading={isLoading}
          />
          
          <Button
            onClick={refreshData}
            disabled={isLoading}
            variant="outline"
            className="flex items-center"
          >
            <FiRefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>

        {/* Error Display */}
        {hasError && (
          <ErrorDisplay error={error!} onRetry={refreshData} />
        )}

        {/* Dashboard Content */}
        {!hasError && (
          <>
            {/* Summary Statistics */}
            <SummaryStats
              totalAssessments={data?.summaryStats.totalAssessments || 0}
              totalUsers={data?.summaryStats.totalUsers || 0}
              averageCqpm={data?.summaryStats.averageCqpm || 0}
              fluentPercentage={data?.summaryStats.fluentPercentage || 0}
              mostActiveAssessmentType={data?.summaryStats.mostActiveAssessmentType || 'N/A'}
              isLoading={isLoading}
            />

            {/* Weekly Activity Chart */}
            <WeeklyActivityChart
              weeklyData={data?.weeklyData || []}
              isLoading={isLoading}
            />

            {/* Two-column layout for tables */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* Fluent Users Ranking */}
              <FluentUsersRanking
                userRankings={data?.userRankings || []}
                isLoading={isLoading}
              />

              {/* Summary Card for Assessment Results */}
              <Card className="shadow-lg border border-gray-100">
                <div className="bg-gradient-to-r from-indigo-600 to-blue-600 py-4 px-6">
                  <h3 className="text-xl font-semibold text-white">Assessment Overview</h3>
                  <p className="text-indigo-100 text-sm mt-1">
                    Quick stats about recent assessments
                  </p>
                </div>
                <CardContent className="p-6">
                  {isLoading ? (
                    <div className="animate-pulse space-y-4">
                      <div className="h-4 bg-gray-300 rounded"></div>
                      <div className="h-4 bg-gray-300 rounded w-2/3"></div>
                      <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Recent Results</span>
                        <span className="font-bold text-gray-900">
                          {data?.assessmentResults.length || 0}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Date Range</span>
                        <span className="text-sm font-medium text-gray-900">
                          {dateRange} days
                        </span>
                      </div>
                      {data && data.assessmentResults.length > 0 && (
                        <div className="text-center pt-4">
                          <p className="text-xs text-gray-500">
                            See detailed table below for complete assessment history
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Full-width Assessment Results Table */}
            <AssessmentResultsTable
              assessmentResults={data?.assessmentResults || []}
              isLoading={isLoading}
            />
          </>
        )}
      </div>
    </div>
  );
};