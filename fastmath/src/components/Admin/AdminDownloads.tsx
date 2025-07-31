import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { FiDownload, FiUsers, FiCalendar, FiClock, FiTarget, FiTrendingUp } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { convertToCSV, downloadCSV, formatDateForFilename } from '../../utils/exportUtils';
import { getAllUsersForDownload, getSessionsForDownload, getDailyGoalsForDownload, getUserProgressForDownload, getProgressAssessmentsForDownload } from '../../api/admin';
import Logo from '../common/Logo';

// Header component for reusability
const AdminHeader = () => (
  <h1 className="text-4xl font-bold text-center mb-6 flex items-center justify-center gap-4">
    <Logo size={32} />
    <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
      FastMath Downloads
    </span>
  </h1>
);

// Access denied component for unauthorized users
const AccessDenied = () => (
  <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
    <div className="max-w-4xl mx-auto text-center">
      <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
      <p className="text-base text-gray-600 mt-2">You are not authorized to view this page.</p>
    </div>
  </div>
);

// Define user interface for type safety
interface UserData {
  userId: string;
  email: string;
  name?: string;
  ageGrade?: string | number;
  focusTrack?: string;
  createdAt: string;
  updatedAt: string;
}

// Define session interface for type safety
interface SessionData {
  userId: string;
  sessionId: string;
  trackId: string;
  startTime: string;
  endTime: string;
  totalDuration: number;
  learningTime: number;
  accuracyPracticeTime: number;
  fluency6PracticeTime: number;
  fluency3PracticeTime: number;
  fluency2PracticeTime: number;
  fluency1_5PracticeTime: number;
  fluency1PracticeTime: number;
  assessmentTime: number;
  otherTime: number;
  learningFactsCount: number;
  accuracyFactsCount: number;
  fluency6FactsCount: number;
  fluency3FactsCount: number;
  fluency2FactsCount: number;
  fluency1_5FactsCount: number;
  fluency1FactsCount: number;
}

// Define daily goal interface for type safety
interface DailyGoalData {
  userId: string;
  date: string;
  trackId: string;
  allCompleted: boolean;
  learningGoal: number;
  learningCompleted: number;
  accuracyGoal: number;
  accuracyCompleted: number;
  fluencyGoal: number;
  fluencyCompleted: number;
  assessmentGoal: number;
  assessmentCompleted: number;
  goalTypes: string;
  createdAt: string;
  updatedAt: string;
}

// Define user progress interface for type safety
interface UserProgressData {
  userId: string;
  trackId: string;
  startDate: string;
  lastUpdated: string;
  status: string;
  overallCQPM: number;
  accuracyRate: number;
  totalFacts: number;
  notStartedCount: number;
  learningCount: number;
  accuracyPracticeCount: number;
  fluency6PracticeCount: number;
  fluency3PracticeCount: number;
  fluency2PracticeCount: number;
  fluency1_5PracticeCount: number;
  fluency1PracticeCount: number;
  masteredCount: number;
  automaticCount: number;
  completionPercentage: number;
  todayDate?: string;
  todayTotalAttempts?: number;
  todayCorrectAttempts?: number;
  todayAccuracyRate?: number;
  todayAvgResponseTime?: number | null;
}

// Define progress assessment interface for type safety
interface ProgressAssessmentData {
  userId: string;
  assessmentId: string;
  trackId: string;
  startDate: string;
  lastUpdated: string;
  status: string;
  overallCQPM: number;
  accuracyRate: number;
  duration: number;
  totalFacts: number;
  totalAttempts: number;
  totalCorrect: number;
  totalTimeSpent: number;
}

export const AdminDownloadsPage = () => {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState<boolean>(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [goalsLoading, setGoalsLoading] = useState<boolean>(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [progressLoading, setProgressLoading] = useState<boolean>(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [assessmentsLoading, setAssessmentsLoading] = useState<boolean>(false);
  const [assessmentsError, setAssessmentsError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  
  // Date range state for sessions download
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Date range state for goals download
  const [goalsStartDate, setGoalsStartDate] = useState<string>('');
  const [goalsEndDate, setGoalsEndDate] = useState<string>('');

  // Date range state for assessments download
  const [assessmentsStartDate, setAssessmentsStartDate] = useState<string>('');
  const [assessmentsEndDate, setAssessmentsEndDate] = useState<string>('');

  // Set default date range to last 7 days
  useEffect(() => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(sevenDaysAgo.toISOString().split('T')[0]);
    setGoalsEndDate(today.toISOString().split('T')[0]);
    setGoalsStartDate(sevenDaysAgo.toISOString().split('T')[0]);
    setAssessmentsEndDate(today.toISOString().split('T')[0]);
    setAssessmentsStartDate(sevenDaysAgo.toISOString().split('T')[0]);
  }, []);

  // Check if user is admin - memoize this value
  const isAdmin = useMemo(() => 
    currentUser?.userId === 'a24ab5cd-4209-41f0-9806-65ae0a9e6957', 
    [currentUser?.userId]
  );

  // Function to download all users as CSV
  const downloadUsersCSV = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get users data from API
      const response = await getAllUsersForDownload();
      const users = response.users as UserData[];
      
      // Define headers for the CSV
      const headers: { key: keyof UserData; label: string }[] = [
        { key: 'userId', label: 'User ID' },
        { key: 'email', label: 'Email' },
        { key: 'name', label: 'Name' },
        { key: 'ageGrade', label: 'Age/Grade' },
        { key: 'focusTrack', label: 'Focus Track' },
        { key: 'createdAt', label: 'Created At' },
        { key: 'updatedAt', label: 'Last Updated' }
      ];
      
      // Convert to CSV
      const csvContent = convertToCSV(users, headers);
      
      // Download the CSV
      const filename = `fastmath-all-users-${formatDateForFilename()}.csv`;
      downloadCSV(csvContent, filename);
      
    } catch (error) {
      setError('Failed to download users data');
      console.error('Error downloading users:', error);
    } finally {
      setLoading(false);
    }
  };

  // Function to download sessions in date range as CSV
  const downloadSessionsCSV = async () => {
    // Validate date inputs
    if (!startDate || !endDate) {
      setSessionsError('Both start date and end date are required');
      return;
    }
    
    // Validate date range
    if (new Date(startDate) > new Date(endDate)) {
      setSessionsError('Start date must be before end date');
      return;
    }
    
    setSessionsLoading(true);
    setSessionsError(null);
    
    try {
      // Get sessions data from API
      const response = await getSessionsForDownload(startDate, endDate);
      const sessions = response.sessions as SessionData[];
      
      if (sessions.length === 0) {
        setSessionsError('No sessions found in the specified date range');
        setSessionsLoading(false);
        return;
      }
      
      // Define headers for the CSV
      const headers: { key: keyof SessionData; label: string }[] = [
        { key: 'userId', label: 'User ID' },
        { key: 'sessionId', label: 'Session ID' },
        { key: 'trackId', label: 'Track' },
        { key: 'startTime', label: 'Start Time' },
        { key: 'endTime', label: 'End Time' },
        { key: 'totalDuration', label: 'Total Duration (seconds)' },
        { key: 'learningTime', label: 'Learning Time (seconds)' },
        { key: 'accuracyPracticeTime', label: 'Accuracy Practice Time (seconds)' },
        { key: 'fluency6PracticeTime', label: 'Fluency 6s Time (seconds)' },
        { key: 'fluency3PracticeTime', label: 'Fluency 3s Time (seconds)' },
        { key: 'fluency2PracticeTime', label: 'Fluency 2s Time (seconds)' },
        { key: 'fluency1_5PracticeTime', label: 'Fluency 1.5s Time (seconds)' },
        { key: 'fluency1PracticeTime', label: 'Fluency 1s Time (seconds)' },
        { key: 'assessmentTime', label: 'Assessment Time (seconds)' },
        { key: 'otherTime', label: 'Other Time (seconds)' },
        { key: 'learningFactsCount', label: 'Learning Facts Count' },
        { key: 'accuracyFactsCount', label: 'Accuracy Facts Count' },
        { key: 'fluency6FactsCount', label: 'Fluency 6s Facts Count' },
        { key: 'fluency3FactsCount', label: 'Fluency 3s Facts Count' },
        { key: 'fluency2FactsCount', label: 'Fluency 2s Facts Count' },
        { key: 'fluency1_5FactsCount', label: 'Fluency 1.5s Facts Count' },
        { key: 'fluency1FactsCount', label: 'Fluency 1s Facts Count' }
      ];
      
      // Convert to CSV
      const csvContent = convertToCSV(sessions, headers);
      
      // Download the CSV with date range in filename
      const filename = `fastmath-sessions-${startDate}-to-${endDate}.csv`;
      downloadCSV(csvContent, filename);
      
    } catch (error) {
      setSessionsError('Failed to download sessions data');
      console.error('Error downloading sessions:', error);
    } finally {
      setSessionsLoading(false);
    }
  };

  // Function to download daily goals in date range as CSV
  const downloadDailyGoalsCSV = async () => {
    // Validate date inputs
    if (!goalsStartDate || !goalsEndDate) {
      setGoalsError('Both start date and end date are required');
      return;
    }
    
    // Validate date range
    if (new Date(goalsStartDate) > new Date(goalsEndDate)) {
      setGoalsError('Start date must be before end date');
      return;
    }
    
    setGoalsLoading(true);
    setGoalsError(null);
    
    try {
      // Get daily goals data from API
      const response = await getDailyGoalsForDownload(goalsStartDate, goalsEndDate);
      const goals = response.goals as DailyGoalData[];
      
      if (goals.length === 0) {
        setGoalsError('No daily goals found in the specified date range');
        setGoalsLoading(false);
        return;
      }
      
      // Define headers for the CSV
      const headers: { key: keyof DailyGoalData; label: string }[] = [
        { key: 'userId', label: 'User ID' },
        { key: 'date', label: 'Date' },
        { key: 'trackId', label: 'Track' },
        { key: 'allCompleted', label: 'All Goals Completed' },
        { key: 'learningGoal', label: 'Learning Goal Count' },
        { key: 'learningCompleted', label: 'Learning Completed Count' },
        { key: 'accuracyGoal', label: 'Accuracy Goal Count' },
        { key: 'accuracyCompleted', label: 'Accuracy Completed Count' },
        { key: 'fluencyGoal', label: 'Fluency Goal Count' },
        { key: 'fluencyCompleted', label: 'Fluency Completed Count' },
        { key: 'assessmentGoal', label: 'Assessment Goal Count' },
        { key: 'assessmentCompleted', label: 'Assessment Completed Count' },
        { key: 'goalTypes', label: 'Goal Types' },
        { key: 'createdAt', label: 'Created At' },
        { key: 'updatedAt', label: 'Updated At' }
      ];
      
      // Convert to CSV
      const csvContent = convertToCSV(goals, headers);
      
      // Download the CSV with date range in filename
      const filename = `fastmath-daily-goals-${goalsStartDate}-to-${goalsEndDate}.csv`;
      downloadCSV(csvContent, filename);
      
    } catch (error) {
      setGoalsError('Failed to download daily goals data');
      console.error('Error downloading daily goals:', error);
    } finally {
      setGoalsLoading(false);
    }
  };

  // Function to download user progress as CSV
  const downloadUserProgressCSV = async () => {
    setProgressLoading(true);
    setProgressError(null);
    
    try {
      // Get user progress data from API with optional userId filter
      const response = await getUserProgressForDownload(userId || undefined);
      const progressData = response.progress as UserProgressData[];
      
      if (progressData.length === 0) {
        setProgressError('No progress data found');
        setProgressLoading(false);
        return;
      }
      
      // Define headers for the CSV
      const headers: { key: keyof UserProgressData; label: string }[] = [
        { key: 'userId', label: 'User ID' },
        { key: 'trackId', label: 'Track' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'lastUpdated', label: 'Last Updated' },
        { key: 'status', label: 'Status' },
        { key: 'overallCQPM', label: 'Overall CQPM' },
        { key: 'accuracyRate', label: 'Accuracy Rate (%)' },
        { key: 'totalFacts', label: 'Total Facts' },
        { key: 'notStartedCount', label: 'Not Started Facts' },
        { key: 'learningCount', label: 'Learning Facts' },
        { key: 'accuracyPracticeCount', label: 'Accuracy Practice Facts' },
        { key: 'fluency6PracticeCount', label: 'Fluency 6s Facts' },
        { key: 'fluency3PracticeCount', label: 'Fluency 3s Facts' },
        { key: 'fluency2PracticeCount', label: 'Fluency 2s Facts' },
        { key: 'fluency1_5PracticeCount', label: 'Fluency 1.5s Facts' },
        { key: 'fluency1PracticeCount', label: 'Fluency 1s Facts' },
        { key: 'masteredCount', label: 'Mastered Facts' },
        { key: 'automaticCount', label: 'Automatic Facts' },
        { key: 'completionPercentage', label: 'Completion Percentage (%)' },
        { key: 'todayDate', label: 'Today\'s Date' },
        { key: 'todayTotalAttempts', label: 'Today\'s Total Attempts' },
        { key: 'todayCorrectAttempts', label: 'Today\'s Correct Attempts' },
        { key: 'todayAccuracyRate', label: 'Today\'s Accuracy Rate (%)' },
        { key: 'todayAvgResponseTime', label: 'Today\'s Avg Response Time (s)' }
      ];
      
      // Convert to CSV
      const csvContent = convertToCSV(progressData, headers);
      
      // Download the CSV
      const filename = `fastmath-user-progress${userId ? `-${userId}` : ''}-${formatDateForFilename()}.csv`;
      downloadCSV(csvContent, filename);
      
    } catch (error) {
      setProgressError('Failed to download user progress data');
      console.error('Error downloading user progress:', error);
    } finally {
      setProgressLoading(false);
    }
  };

  // Function to download progress assessments in date range as CSV
  const downloadProgressAssessmentsCSV = async () => {
    // Validate date inputs
    if (!assessmentsStartDate || !assessmentsEndDate) {
      setAssessmentsError('Both start date and end date are required');
      return;
    }
    
    // Validate date range
    if (new Date(assessmentsStartDate) > new Date(assessmentsEndDate)) {
      setAssessmentsError('Start date must be before end date');
      return;
    }
    
    setAssessmentsLoading(true);
    setAssessmentsError(null);
    
    try {
      // Get progress assessments data from API
      const response = await getProgressAssessmentsForDownload(assessmentsStartDate, assessmentsEndDate);
      const assessments = response.assessments as ProgressAssessmentData[];
      
      if (assessments.length === 0) {
        setAssessmentsError('No progress assessments found in the specified date range');
        setAssessmentsLoading(false);
        return;
      }
      
      // Define headers for the CSV
      const headers: { key: keyof ProgressAssessmentData; label: string }[] = [
        { key: 'userId', label: 'User ID' },
        { key: 'assessmentId', label: 'Assessment ID' },
        { key: 'trackId', label: 'Track' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'lastUpdated', label: 'Last Updated' },
        { key: 'status', label: 'Status' },
        { key: 'overallCQPM', label: 'Overall CQPM' },
        { key: 'accuracyRate', label: 'Accuracy Rate (%)' },
        { key: 'duration', label: 'Duration (minutes)' },
        { key: 'totalFacts', label: 'Total Facts' },
        { key: 'totalAttempts', label: 'Total Attempts' },
        { key: 'totalCorrect', label: 'Total Correct' },
        { key: 'totalTimeSpent', label: 'Total Time Spent (seconds)' }
      ];
      
      // Convert to CSV
      const csvContent = convertToCSV(assessments, headers);
      
      // Download the CSV with date range in filename
      const filename = `fastmath-progress-assessments-${assessmentsStartDate}-to-${assessmentsEndDate}.csv`;
      downloadCSV(csvContent, filename);
      
    } catch (error) {
      setAssessmentsError('Failed to download progress assessments data');
      console.error('Error downloading progress assessments:', error);
    } finally {
      setAssessmentsLoading(false);
    }
  };

  // Early return if not admin
  if (!isAdmin) {
    return <AccessDenied />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <AdminHeader />
        
        {/* Navigation */}
        <div className="flex mb-4">
          <Link 
            to="/admin" 
            className="text-blue-600 hover:text-blue-800 transition-colors duration-300"
          >
            ← Back to Admin Dashboard
          </Link>
        </div>

        {/* Downloads Section */}
        <Card className="overflow-hidden rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-4 px-6">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <FiUsers className="text-yellow-300" size={24} />
              Data Downloads
            </h2>
          </div>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-6">
              {/* All Users Download */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                <h3 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
                  <FiUsers className="text-blue-500" />
                  All Users
                </h3>
                <p className="text-gray-600 mb-4">Download a CSV file containing all users in the system</p>
                
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg mb-4">
                    {error}
                  </div>
                )}
                
                <Button 
                  onClick={downloadUsersCSV}
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2"
                >
                  <FiDownload />
                  {loading ? 'Downloading...' : 'Download CSV'}
                </Button>
              </div>
              
              {/* Sessions in Date Range Download */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                <h3 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
                  <FiClock className="text-blue-500" />
                  Sessions by Date Range
                </h3>
                <p className="text-gray-600 mb-4">Download a CSV file of all sessions within a specified date range</p>
                
                {sessionsError && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg mb-4">
                    {sessionsError}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-4 mb-4">
                  <div className="flex flex-col">
                    <label htmlFor="startDate" className="text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <div className="relative">
                      <input 
                        type="date" 
                        id="startDate"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pl-10"
                      />
                      <FiCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    </div>
                  </div>
                  
                  <div className="flex flex-col">
                    <label htmlFor="endDate" className="text-sm font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <div className="relative">
                      <input 
                        type="date" 
                        id="endDate"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pl-10"
                      />
                      <FiCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    </div>
                  </div>
                </div>
                
                <Button 
                  onClick={downloadSessionsCSV}
                  disabled={sessionsLoading || !startDate || !endDate}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2"
                >
                  <FiDownload />
                  {sessionsLoading ? 'Downloading...' : 'Download Sessions CSV'}
                </Button>
              </div>
              
              {/* Daily Goals in Date Range Download */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                <h3 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
                  <FiTarget className="text-blue-500" />
                  Daily Goals by Date Range
                </h3>
                <p className="text-gray-600 mb-4">Download a CSV file of all daily goals within a specified date range</p>
                
                {goalsError && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg mb-4">
                    {goalsError}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-4 mb-4">
                  <div className="flex flex-col">
                    <label htmlFor="goalsStartDate" className="text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <div className="relative">
                      <input 
                        type="date" 
                        id="goalsStartDate"
                        value={goalsStartDate}
                        onChange={(e) => setGoalsStartDate(e.target.value)}
                        className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pl-10"
                      />
                      <FiCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    </div>
                  </div>
                  
                  <div className="flex flex-col">
                    <label htmlFor="goalsEndDate" className="text-sm font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <div className="relative">
                      <input 
                        type="date" 
                        id="goalsEndDate"
                        value={goalsEndDate}
                        onChange={(e) => setGoalsEndDate(e.target.value)}
                        className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pl-10"
                      />
                      <FiCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    </div>
                  </div>
                </div>
                
                <Button 
                  onClick={downloadDailyGoalsCSV}
                  disabled={goalsLoading || !goalsStartDate || !goalsEndDate}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2"
                >
                  <FiDownload />
                  {goalsLoading ? 'Downloading...' : 'Download Daily Goals CSV'}
                </Button>
              </div>

              {/* User Progress Download */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                <h3 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
                  <FiTrendingUp className="text-blue-500" />
                  User Progress Data
                </h3>
                <p className="text-gray-600 mb-4">Download a CSV file containing user progress data across all tracks. Optionally filter by a specific user ID.</p>
                
                {progressError && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg mb-4">
                    {progressError}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-4 mb-4">
                  <div className="flex flex-col w-full max-w-md">
                    <label htmlFor="userId" className="text-sm font-medium text-gray-700 mb-1">
                      User ID (Optional)
                    </label>
                    <input 
                      type="text" 
                      id="userId"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="Enter user ID to filter (leave blank for all users)"
                      className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Leave blank to download progress for all users
                    </p>
                  </div>
                </div>
                
                <Button 
                  onClick={downloadUserProgressCSV}
                  disabled={progressLoading}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2"
                >
                  <FiDownload />
                  {progressLoading ? 'Downloading...' : 'Download Progress CSV'}
                </Button>
              </div>

              {/* Progress Assessments Download */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                <h3 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
                  <FiTarget className="text-blue-500" />
                  Progress Assessments
                </h3>
                <p className="text-gray-600 mb-4">Download a CSV file of all progress assessments within a specified date range</p>
                
                {assessmentsError && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg mb-4">
                    {assessmentsError}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-4 mb-4">
                  <div className="flex flex-col">
                    <label htmlFor="assessmentsStartDate" className="text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <div className="relative">
                      <input 
                        type="date" 
                        id="assessmentsStartDate"
                        value={assessmentsStartDate}
                        onChange={(e) => setAssessmentsStartDate(e.target.value)}
                        className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pl-10"
                      />
                      <FiCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    </div>
                  </div>
                  
                  <div className="flex flex-col">
                    <label htmlFor="assessmentsEndDate" className="text-sm font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <div className="relative">
                      <input 
                        type="date" 
                        id="assessmentsEndDate"
                        value={assessmentsEndDate}
                        onChange={(e) => setAssessmentsEndDate(e.target.value)}
                        className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pl-10"
                      />
                      <FiCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                    </div>
                  </div>
                </div>
                
                <Button 
                  onClick={downloadProgressAssessmentsCSV}
                  disabled={assessmentsLoading || !assessmentsStartDate || !assessmentsEndDate}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 flex items-center gap-2"
                >
                  <FiDownload />
                  {assessmentsLoading ? 'Downloading...' : 'Download Assessments CSV'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDownloadsPage; 