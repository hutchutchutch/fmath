import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getActiveStudents } from '../../config/api';
import { CircularProgress, Alert, Tabs, Tab, Tooltip, Box } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import StudentData from './StudentData';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { FiFilter, FiX, FiChevronDown } from 'react-icons/fi';

interface UserData {
  userId: string;
  name: string;
  email: string;
  campus: string;
  lastSession: string | null;
  lastSessionDate?: Date; // For sorting purposes
  timeSpentToday: number;
  avgTimeSpentWeek: number; // Add average time spent per day last week
  dailyTimeData: { date: string; totalTime: number }[]; // Daily time data for the past 7 days
  factsLearntToday: number;
  factsAccuracyToday: number;
  factsFluency1_5Today: number;
  latestCQPM: number | null;
  previousCQPM: number | null;
  changePercent: number | null;
  todaysGoals: { achieved: number; total: number }; // Today's achieved goals out of total goals
  dailyGoalsData: { date: string; achieved: number; total: number }[]; // Daily goals data for the past 7 days
  goalCompletionRate: number; // Average goal completion percentage for the past 7 days
  activeTrack: string; // Active track name
}

// Type definition for session analytics response
interface SessionAnalyticsData {
  totalTimeSpent: number;
  timeByActivity: {
    learningTime: number;
    accuracyPracticeTime: number;
    fluency6PracticeTime: number;
    fluency3PracticeTime: number;
    fluency2PracticeTime: number;
    fluency1_5PracticeTime: number;
    fluency1PracticeTime: number;
    assessmentTime: number;
    otherTime: number;
  };
  averageTimePerIteration: {
    learning?: number;
    accuracyPractice?: number;
    fluency6Practice?: number;
    fluency3Practice?: number;
    fluency2Practice?: number;
    fluency1_5Practice?: number;
    fluency1Practice?: number;
  };
  lastActivity?: string;
}

// Interface for the new backend response that combines user and session data
interface ActiveStudentData {
  userId: string;
  name: string;
  email: string;
  campus?: string;
  focusTrack?: string;
  tracks: {
    [trackId: string]: {
      latestCQPM: number;
      previousCQPM: number | null;
      cqpmHistory: Array<{date: string, cqpm: number}>;
    }
  };
  sessionData: {
    timeSpentToday: number;
    avgTimeSpentWeek: number;
    dailyTimeData: { date: string; totalTime: number }[];
    lastActivity: string;
  };
  accuracyFacts: {
    accuracyPractice: number;
    fluency1_5Practice: number;
    learningFacts: number;
  };
  goals: {
    todaysGoals: { achieved: number; total: number };
    dailyGoalsData: { date: string; achieved: number; total: number }[];
    goalCompletionRate: number;
  };
}

// Constants
const TABLE_HEADERS = [
  'Name',
  'Campus',
  'Last Active',
  'Active Track',
  'Time Today',
  'Time last 7 days',
  'Facts Learnt',
  'Facts Accuracy',
  'Facts Fluency (1.5s)',
  'Today\'s Goals',
  'Goals per Day',
  'Goal Completion Rate',
  'Latest CQPM',
  'Previous CQPM'
];

// Define which headers should be visible for each tab
const TAB_VISIBLE_COLUMNS = {
  0: ['Name', 'Campus', 'Last Active', 'Active Track', 'Time Today', 'Time last 7 days', 'Goal Completion Rate'], // Time Spent
  1: ['Name', 'Campus', 'Last Active', 'Today\'s Goals', 'Goals per Day', 'Facts Learnt', 'Facts Accuracy', 'Facts Fluency (1.5s)'], // Daily Goals
  2: ['Name', 'Campus', 'Last Active'], // Progress - empty for now
  3: ['Name', 'Campus', 'Last Active', 'Latest CQPM', 'Previous CQPM'] // CQPM
};

const HEADER_CELL_STYLE = { 
  backgroundColor: '#f0f9ff',
  fontWeight: 600,
  color: '#334155',
  borderBottom: '2px solid #bfdbfe',
  padding: '8px 16px',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

// Column-specific styles
const COLUMN_STYLES = {
  Name: {
    maxWidth: '150px'
  },
  Campus: {
    maxWidth: '200px'
  }
};

// Track ID to name mapping
const TRACK_NAME_MAP: Record<string, string> = {
  'TRACK1': 'Addition',
  'TRACK2': 'Subtraction',
  'TRACK3': 'Multiplication',
  'TRACK4': 'Division',
  'TRACK5': 'Division (Quotient ≤12)',
  'TRACK6': 'Addition (≤20)',
  'TRACK7': 'Multiplication (≤12)',
  'TRACK8': 'Subtraction (≤20)'
};

// Campus Filter Component
const CampusFilter = React.memo(({ 
  availableCampuses, 
  selectedCampuses, 
  onSelectionChange 
}: { 
  availableCampuses: string[]; 
  selectedCampuses: string[]; 
  onSelectionChange: (campuses: string[]) => void; 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCampusToggle = (campus: string) => {
    if (selectedCampuses.includes(campus)) {
      onSelectionChange(selectedCampuses.filter(c => c !== campus));
    } else {
      onSelectionChange([...selectedCampuses, campus]);
    }
  };

  const handleSelectAll = () => {
    onSelectionChange(availableCampuses);
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="w-64 justify-between text-sm"
      >
        <div className="flex items-center gap-2">
          <FiFilter size={14} />
          <span>
            {selectedCampuses.length === 0 
              ? 'Filter by Campus' 
              : selectedCampuses.length === availableCampuses.length
                ? 'All Campuses'
                : `${selectedCampuses.length} Campus${selectedCampuses.length !== 1 ? 'es' : ''}`
            }
          </span>
        </div>
        <FiChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleSelectAll} className="text-xs">
                Select All
              </Button>
              <Button size="sm" variant="outline" onClick={handleClearAll} className="text-xs">
                Clear All
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setIsOpen(false)}
                className="text-xs ml-auto"
              >
                <FiX size={14} />
              </Button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {availableCampuses.map((campus) => (
              <label
                key={campus}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCampuses.includes(campus)}
                  onChange={() => handleCampusToggle(campus)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 flex-1">{campus}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// Small bar chart component for showing daily time data
const DailyTimeBarChart = React.memo(({ dailyTimeData }: { dailyTimeData: { date: string; totalTime: number }[] }) => {
  // Maximum time for scaling - 20 minutes in seconds
  const MAX_TIME = 1200; 
  
  // Thresholds for color coding (in seconds)
  const HIGH_THRESHOLD = 900;  // 15 minutes
  const MEDIUM_THRESHOLD = 600; // 10 minutes
  
  // Get color based on time value
  const getBarColor = (seconds: number) => {
    if (seconds === 0) return '#e2e8f0'; // gray for no activity
    if (seconds >= HIGH_THRESHOLD) return '#22c55e'; // green for high activity
    if (seconds >= MEDIUM_THRESHOLD) return '#eab308'; // yellow for medium activity
    return '#ef4444'; // red for low activity
  };
  
  // Format date for tooltip
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };
  
  // Convert seconds to minutes for display
  const formatMinutes = (seconds: number) => {
    return `${Math.round(seconds / 60)} min`;
  };
  
  if (!dailyTimeData || dailyTimeData.length === 0) {
    return null;
  }
  
  return (
    <div className="flex items-center h-8 ml-3 gap-1 min-w-[90px] justify-center">
      {dailyTimeData.map((day, index) => {
        // Calculate height percentage (max 100%)
        const heightPercent = Math.min(100, (day.totalTime / MAX_TIME) * 100);
        // Calculate actual height in pixels (max 24px for our container)
        const heightPx = Math.max((heightPercent / 100) * 24, 2);
        const color = getBarColor(day.totalTime);
        
        return (
          <Tooltip 
            key={index} 
            title={`${formatDate(day.date)}: ${formatMinutes(day.totalTime)}`}
            arrow
            placement="top"
          >
            <div className="flex flex-col justify-end h-full">
              <div 
                className="w-2 rounded-t-sm"
                style={{ 
                  height: `${day.totalTime > 0 ? heightPx : 1}px`, 
                  backgroundColor: color,
                  minHeight: '1px', // Ensure at least 1px height for empty bars
                  transition: 'height 0.2s ease-in-out'
                }}
              />
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
});

// Daily Goals Chart component for showing daily goals data
const DailyGoalsChart = React.memo(({ dailyGoalsData }: { dailyGoalsData: { date: string; achieved: number; total: number }[] }) => {
  // Format date for tooltip
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };
  
  // Get color based on achieved vs total goals
  const getColor = (achieved: number, total: number) => {
    if (total === 0) return '#e2e8f0'; // gray for no goals
    const ratio = achieved / total;
    if (ratio === 1) return '#22c55e'; // green for all goals achieved
    if (ratio >= 0.5) return '#eab308'; // yellow for half or more goals achieved
    return '#ef4444'; // red for less than half goals achieved
  };
  
  if (!dailyGoalsData || dailyGoalsData.length === 0) {
    return null;
  }
  
  return (
    <div className="flex items-center h-8 gap-1 min-w-[120px] justify-end">
      {dailyGoalsData.map((day, index) => {
        const color = getColor(day.achieved, day.total);
        
        return (
          <Tooltip 
            key={index} 
            title={`${formatDate(day.date)}: ${day.achieved}/${day.total} goals achieved`}
            arrow
            placement="top"
          >
            <div 
              className="flex items-center justify-center h-6 w-6 rounded-full border"
              style={{ 
                backgroundColor: color,
                opacity: day.total > 0 ? 1 : 0.3,
                color: 'white',
                fontWeight: 600,
                fontSize: '10px',
                lineHeight: 1,
                cursor: 'pointer'
              }}
            >
              {day.total > 0 ? `${day.achieved}/${day.total}` : '-'}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
});

// Legend component for time chart
const TimeChartLegend = React.memo(() => {
  return (
    <Tooltip
      title={
        <div className="p-1">
          <div className="mb-2 font-medium">Time Chart Color Coding:</div>
          <div className="flex items-center mb-1">
            <div className="w-3 h-3 bg-green-500 mr-2 rounded-sm"></div>
            <span>Good: 15+ minutes</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-3 h-3 bg-yellow-500 mr-2 rounded-sm"></div>
            <span>Fair: 10-15 minutes</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-3 h-3 bg-red-500 mr-2 rounded-sm"></div>
            <span>Low: Under 10 minutes</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-gray-200 mr-2 rounded-sm"></div>
            <span>No activity</span>
          </div>
        </div>
      }
      arrow
      placement="top"
    >
      <InfoOutlinedIcon fontSize="small" className="text-gray-400 cursor-help ml-1" />
    </Tooltip>
  );
});

// Legend component for goals chart
const GoalsChartLegend = React.memo(() => {
  return (
    <Tooltip
      title={
        <div className="p-1">
          <div className="mb-2 font-medium">Goals Chart Color Coding:</div>
          <div className="flex items-center mb-1">
            <div className="w-3 h-3 bg-green-500 mr-2 rounded-sm"></div>
            <span>All goals achieved (3/3)</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-3 h-3 bg-yellow-500 mr-2 rounded-sm"></div>
            <span>Half or more goals achieved (1-2/3)</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-3 h-3 bg-red-500 mr-2 rounded-sm"></div>
            <span>Less than half goals achieved (0/3)</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-gray-200 mr-2 rounded-sm"></div>
            <span>No goals set</span>
          </div>
        </div>
      }
      arrow
      placement="top"
    >
      <InfoOutlinedIcon fontSize="small" className="text-gray-400 cursor-help ml-1" />
    </Tooltip>
  );
});

// Memoized components for better performance
const LoadingState = React.memo(() => (
  <div className="flex justify-center items-center p-8 min-h-[200px]">
    <CircularProgress size={40} thickness={4} sx={{ color: '#3b82f6' }} />
  </div>
));

const ErrorState = React.memo(({ message }: { message: string }) => (
  <Alert 
    severity="error" 
    className="m-4 rounded-lg border border-red-200 shadow-sm"
    sx={{ 
      fontWeight: 500,
      '& .MuiAlert-icon': { color: '#ef4444' }
    }}
  >
    {message}
  </Alert>
));

const EmptyState = React.memo(() => (
  <Alert 
    severity="info" 
    className="m-4 rounded-lg border border-blue-200 shadow-sm"
    sx={{ 
      fontWeight: 500,
      '& .MuiAlert-icon': { color: '#3b82f6' }
    }}
  >
    No user data available
  </Alert>
));

const TableHeader = React.memo(({ activeTab }: { activeTab: number }) => {
  const visibleHeaders = TAB_VISIBLE_COLUMNS[activeTab as keyof typeof TAB_VISIBLE_COLUMNS];
  
  return (
    <TableHead>
      <TableRow>
        {TABLE_HEADERS.map((header, index) => {
          // Only render columns that should be visible for the current tab
          if (!visibleHeaders.includes(header)) return null;
          
          return (
            <TableCell 
              key={index}
              align={index > 1 ? 'right' : 'left'}
              sx={{ 
                ...HEADER_CELL_STYLE,
                ...(COLUMN_STYLES[header as keyof typeof COLUMN_STYLES] || {})
              }}
            >
              <div className={`flex items-center ${index > 1 ? 'justify-end' : 'justify-start'}`}>
                {header}
                {header === 'Time last 7 days' && (
                  <TimeChartLegend />
                )}
                {header === 'Goals per Day' && (
                  <GoalsChartLegend />
                )}
              </div>
            </TableCell>
          );
        })}
      </TableRow>
    </TableHead>
  );
});

interface UserRowProps {
  user: UserData;
  index: number;
  onRowClick: (user: UserData) => void;
  activeTab: number;
}

const UserRow = React.memo(({ user, index, onRowClick, activeTab }: UserRowProps) => {
  // Format time in minutes - moved inside component as it's only used here
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  // Function to get color based on time value - same logic as in DailyTimeBarChart
  const getTimeColor = (seconds: number) => {
    const HIGH_THRESHOLD = 900;  // 15 minutes
    const MEDIUM_THRESHOLD = 600; // 10 minutes
    
    if (seconds === 0) return '#e2e8f0'; // gray for no activity
    if (seconds >= HIGH_THRESHOLD) return '#22c55e'; // green for high activity
    if (seconds >= MEDIUM_THRESHOLD) return '#eab308'; // yellow for medium activity
    return '#ef4444'; // red for low activity
  };

  // Function to get color based on goal achievement
  const getGoalColor = (achieved: number, total: number) => {
    if (total === 0) return 'bg-gray-100 text-gray-700';
    const ratio = achieved / total;
    if (ratio === 1) return 'bg-green-100 text-green-700';
    if (ratio >= 0.5) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const visibleHeaders = TAB_VISIBLE_COLUMNS[activeTab as keyof typeof TAB_VISIBLE_COLUMNS];

  return (
    <TableRow 
      sx={{ 
        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
        '&:hover': { 
          backgroundColor: '#f1f5f9',
          cursor: 'pointer',
          transition: 'background-color 0.2s'
        },
        '& .MuiTableCell-root': {
          padding: '6px 16px',
          height: '48px'
        }
      }}
      onClick={() => onRowClick(user)}
    >
      {/* Name - Column 0 */}
      {visibleHeaders.includes('Name') && (
        <TableCell sx={{ 
          fontWeight: 600, 
          color: '#334155',
          ...(COLUMN_STYLES['Name'] || {})
        }}>
          <div className="flex items-center">
            <div className="truncate" title={user.name}>
              {user.name}
            </div>
          </div>
        </TableCell>
      )}
      
      {/* Campus - Column 1 */}
      {visibleHeaders.includes('Campus') && (
        <TableCell>
          <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            {user.campus}
          </span>
        </TableCell>
      )}
      
      {/* Last Active - Column 2 */}
      {visibleHeaders.includes('Last Active') && (
        <TableCell>
          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
            user.lastSession === 'Today' 
              ? 'bg-green-100 text-green-700' 
              : user.lastSession === 'Yesterday'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-700'
          }`}>
            {user.lastSession || 'Never'}
          </span>
        </TableCell>
      )}
      
      {/* Active Track - Column 3 */}
      {visibleHeaders.includes('Active Track') && (
        <TableCell>
          <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            {user.activeTrack || 'None'}
          </span>
        </TableCell>
      )}
      
      {/* Time Today - Column 4 */}
      {visibleHeaders.includes('Time Today') && (
        <TableCell align="right" sx={{ fontWeight: 500, color: '#475569' }}>
          <span 
            className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
              user.timeSpentToday >= 900 
                ? 'bg-green-100 text-green-700' 
                : user.timeSpentToday >= 600
                  ? 'bg-yellow-100 text-yellow-700'
                  : user.timeSpentToday > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
            }`}
          >
            {formatTime(user.timeSpentToday)}
          </span>
        </TableCell>
      )}
      
      {/* Time last 7 days - Column 5 */}
      {visibleHeaders.includes('Time last 7 days') && (
        <TableCell align="right" sx={{ fontWeight: 500, color: '#475569' }}>
          <div className="flex justify-end items-center h-full">
            <span 
              className={`whitespace-nowrap mr-4 inline-block px-2 py-1 rounded-full text-xs font-medium ${
                user.avgTimeSpentWeek >= 900 
                  ? 'bg-green-100 text-green-700' 
                  : user.avgTimeSpentWeek >= 600
                    ? 'bg-yellow-100 text-yellow-700'
                    : user.avgTimeSpentWeek > 0
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-700'
              }`}
            >
              {formatTime(user.avgTimeSpentWeek)}
            </span>
            {user.dailyTimeData && user.dailyTimeData.length > 0 && (
              <DailyTimeBarChart dailyTimeData={user.dailyTimeData} />
            )}
          </div>
        </TableCell>
      )}
      
      {/* Facts Learnt - Column 6 */}
      {visibleHeaders.includes('Facts Learnt') && (
        <TableCell align="right" sx={{ color: '#475569' }}>
          {user.factsLearntToday}
        </TableCell>
      )}
      
      {/* Facts Accuracy - Column 7 */}
      {visibleHeaders.includes('Facts Accuracy') && (
        <TableCell align="right">
          {user.factsAccuracyToday > 0 ? (
            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              {user.factsAccuracyToday}
            </span>
          ) : (
            <span className="text-gray-500">0</span>
          )}
        </TableCell>
      )}
      
      {/* Facts Fluency (1.5s) - Column 8 */}
      {visibleHeaders.includes('Facts Fluency (1.5s)') && (
        <TableCell align="right">
          {user.factsFluency1_5Today > 0 ? (
            <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              {user.factsFluency1_5Today}
            </span>
          ) : (
            <span className="text-gray-500">0</span>
          )}
        </TableCell>
      )}
      
      {/* Today's Goals - Column 9 */}
      {visibleHeaders.includes('Today\'s Goals') && (
        <TableCell align="right">
          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
            getGoalColor(user.todaysGoals.achieved, user.todaysGoals.total)
          }`}>
            {user.todaysGoals.achieved}/{user.todaysGoals.total}
          </span>
        </TableCell>
      )}
      
      {/* Goals per Day - Column 10 */}
      {visibleHeaders.includes('Goals per Day') && (
        <TableCell align="right">
          <div className="flex justify-end items-center h-full">
            {user.dailyGoalsData && user.dailyGoalsData.length > 0 ? (
              <DailyGoalsChart dailyGoalsData={user.dailyGoalsData} />
            ) : (
              <span className="text-gray-500">-</span>
            )}
          </div>
        </TableCell>
      )}
      
      {/* Goal Completion Rate - Column 11 */}
      {visibleHeaders.includes('Goal Completion Rate') && (
        <TableCell align="right">
          {user.goalCompletionRate > 0 ? (
            <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
              user.goalCompletionRate > 90 
                ? 'bg-green-100 text-green-700' 
                : user.goalCompletionRate >= 60
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
            }`}>
              {user.goalCompletionRate}%
            </span>
          ) : (
            <span className="text-gray-500">-</span>
          )}
        </TableCell>
      )}
      
      {/* Latest CQPM - Column 12 */}
      {visibleHeaders.includes('Latest CQPM') && (
        <TableCell align="right" sx={{ fontWeight: 600, color: '#334155' }}>
          {user.latestCQPM ? user.latestCQPM.toFixed(0) : '-'}
        </TableCell>
      )}
      
      {/* Previous CQPM - Column 13 */}
      {visibleHeaders.includes('Previous CQPM') && (
        <TableCell align="right" sx={{ fontWeight: 500, color: '#475569' }}>
          {user.previousCQPM ? user.previousCQPM.toFixed(0) : '-'}
        </TableCell>
      )}
    </TableRow>
  );
});

const UserDataTable: React.FC = () => {
  const [userData, setUserData] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [activeStudentsData, setActiveStudentsData] = useState<{ [userId: string]: ActiveStudentData } | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedCampuses, setSelectedCampuses] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Extracted date helper functions and memoized them
  const dateHelpers = useMemo(() => ({
    isToday: (date: Date): boolean => {
      const today = new Date();
      return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
    },
    
    isYesterday: (date: Date): boolean => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear();
    },
    
    formatDate: (date: Date): string => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }
  }), []);

  // Calculate facts per time - memoized calculation function
  const calculateFactsPerTime = useCallback((timeSpent: number, timePerIteration?: number): number => {
    if (!timePerIteration || timePerIteration === 0) return 0;
    return Math.round(timeSpent / timePerIteration) || 0;
  }, []);

  // Fetch data with useCallback to avoid recreation on each render
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      const activeStudentsData: { [userId: string]: ActiveStudentData } = await getActiveStudents();
      setActiveStudentsData(activeStudentsData);
      const combinedData: UserData[] = [];
      
      if (activeStudentsData) {
        console.log('Active students data:', activeStudentsData);
        
        Object.entries(activeStudentsData).forEach(([userId, userData]) => {
          const { sessionData } = userData;
          
          // Log session data for debugging
          console.log(`User ${userId} session data:`, sessionData);
          
          // Use the learning facts count from the backend
          const factsLearntToday = userData.accuracyFacts?.learningFacts || 0;
          
          // Use the perfect accuracy counts for accuracy facts
          const factsAccuracyToday = userData.accuracyFacts?.accuracyPractice || 0;
          
          // Use the perfect accuracy counts for fluency1_5 facts
          const factsFluency1_5Today = userData.accuracyFacts?.fluency1_5Practice || 0;
          
          // Get track data more efficiently
          const tracks = userData.tracks || {};
          const trackKeys = Object.keys(tracks);
          const trackId = trackKeys.length > 0 ? trackKeys[0] : 'TRACK1';
          const trackData = tracks[trackId] || { latestCQPM: null, previousCQPM: null };
          
          // Calculate change percentage based on latest and previous CQPM
          // Note: The backend now returns daily averaged values for latestCQPM and previousCQPM
          // so we're using these values directly without any additional averaging
          let changePercent = null;
          if (trackData.latestCQPM !== null && trackData.previousCQPM !== null && trackData.previousCQPM !== 0) {
            changePercent = ((trackData.latestCQPM - trackData.previousCQPM) / trackData.previousCQPM) * 100;
          }
          
          // Format session timestamp
          let lastSessionFormatted = null;
          let lastSessionDate: Date | undefined = undefined;
          
          if (sessionData?.lastActivity) {
            const lastActivityDate = new Date(sessionData.lastActivity);
            lastSessionDate = lastActivityDate;
            
            if (dateHelpers.isToday(lastActivityDate)) {
              lastSessionFormatted = 'Today';
            } else if (dateHelpers.isYesterday(lastActivityDate)) {
              lastSessionFormatted = 'Yesterday';
            } else {
              lastSessionFormatted = dateHelpers.formatDate(lastActivityDate);
            }
          }
          
          // Create a default dailyTimeData array if it's missing
          let dailyTimeData = sessionData?.dailyTimeData || [];
          
          // Log for debugging
          console.log(`User ${userId} daily time data:`, dailyTimeData);
          
          // If it's empty or undefined, create a sample array for testing
          if (!dailyTimeData || dailyTimeData.length === 0) {
            const today = new Date();
            dailyTimeData = Array(7).fill(0).map((_, i) => {
              const date = new Date(today);
              date.setDate(date.getDate() - 6 + i);
              return {
                date: date.toISOString().split('T')[0],
                totalTime: Math.floor(Math.random() * 1200) // Random time up to 20 minutes
              };
            });
            console.log(`Created sample data for user ${userId}:`, dailyTimeData);
          }
          
          // Initialize daily goals data
          let dailyGoalsData = userData.goals?.dailyGoalsData || [];
          
          // Get the goal completion rate
          const goalCompletionRate = userData.goals?.goalCompletionRate || 0;
          
          // Get active track name from focusTrack ID
          const activeTrack = userData.focusTrack ? TRACK_NAME_MAP[userData.focusTrack] || userData.focusTrack : 'None';
          
          combinedData.push({
            userId,
            name: userData.name,
            email: userData.email,
            campus: userData.campus || 'Unknown',
            lastSession: lastSessionFormatted,
            lastSessionDate,
            timeSpentToday: sessionData?.timeSpentToday || 0,
            avgTimeSpentWeek: sessionData?.avgTimeSpentWeek || 0,
            dailyTimeData,
            factsLearntToday,
            factsAccuracyToday,
            factsFluency1_5Today,
            latestCQPM: trackData.latestCQPM,
            previousCQPM: trackData.previousCQPM,
            changePercent,
            todaysGoals: userData.goals?.todaysGoals || { achieved: 0, total: 0 },
            dailyGoalsData,
            goalCompletionRate,
            activeTrack
          });
        });
      }
      
      // Sort data - more concise sorting function
      const sortedData = [...combinedData].sort((a, b) => {
        if (!a.lastSessionDate && !b.lastSessionDate) return 0;
        if (!a.lastSessionDate) return 1;
        if (!b.lastSessionDate) return -1;
        return b.lastSessionDate.getTime() - a.lastSessionDate.getTime();
      });
      
      setUserData(sortedData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user data');
    } finally {
      setLoading(false);
    }
  }, [calculateFactsPerTime, dateHelpers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle row click
  const handleRowClick = useCallback((user: UserData) => {
    setSelectedUser(user);
  }, []);

  // Handle back from student details
  const handleBackClick = useCallback(() => {
    setSelectedUser(null);
  }, []);

  // Handle tab change
  const handleTabChange = useCallback((event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  }, []);

  // Handle campus selection change
  const handleCampusSelection = useCallback((campuses: string[]) => {
    setSelectedCampuses(campuses);
  }, []);

  // Get available campuses from user data
  const availableCampuses = useMemo(() => {
    const campuses = Array.from(new Set(userData.map(user => user.campus))).filter(Boolean);
    return campuses.sort();
  }, [userData]);

  // Initialize selected campuses to all campuses when data first loads
  useEffect(() => {
    if (availableCampuses.length > 0 && !hasInitialized) {
      setSelectedCampuses(availableCampuses);
      setHasInitialized(true);
    }
  }, [availableCampuses, hasInitialized]);

  // Filter user data based on selected campuses
  const filteredUserData = useMemo(() => {
    if (selectedCampuses.length === 0) {
      return []; // Show no users when no campuses are selected
    }
    return userData.filter(user => selectedCampuses.includes(user.campus));
  }, [userData, selectedCampuses]);

  // If a user is selected, show the student data component
  if (selectedUser) {
    // Get the full student data from activeStudentsData
    const activeStudent = activeStudentsData ? activeStudentsData[selectedUser.userId] : undefined;
    
    return (
      <StudentData 
        userId={selectedUser.userId}
        name={selectedUser.name}
        email={selectedUser.email}
        onBack={handleBackClick}
        studentData={activeStudent}
      />
    );
  }

  // Use early returns for different states
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!userData.length) return <EmptyState />;

  return (
    <div className="space-y-4">
      {/* Filters Section */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Student Dashboard</h3>
              <p className="text-sm text-gray-600">
                Showing {filteredUserData.length} of {userData.length} students
                {selectedCampuses.length < availableCampuses.length && 
                  ` (filtered by ${selectedCampuses.length} campus${selectedCampuses.length !== 1 ? 'es' : ''})`
                }
              </p>
            </div>
            <div className="flex gap-3">
              <CampusFilter 
                availableCampuses={availableCampuses}
                selectedCampuses={selectedCampuses}
                onSelectionChange={handleCampusSelection}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="border-b border-gray-200">
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              minWidth: 100,
            },
          }}
        >
          <Tab label="Time Spent" />
          <Tab label="Daily Goals" />
          <Tab label="Progress" />
          <Tab label="CQPM" />
        </Tabs>
      </div>
      
      <div className="overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <TableContainer 
            component={Paper} 
            elevation={0}
            sx={{ 
              borderRadius: 0,
              boxShadow: 'none'
            }}
          >
            <Table 
              sx={{ 
                minWidth: 650,
                '& .MuiTableCell-root': {
                  whiteSpace: 'nowrap'
                }
              }} 
              aria-label="user data table"
              size="small"
            >
              <TableHeader activeTab={activeTab} />
              <TableBody>
                {filteredUserData.map((user, index) => (
                  <UserRow 
                    key={user.userId} 
                    user={user} 
                    index={index} 
                    onRowClick={handleRowClick}
                    activeTab={activeTab}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      </div>
    </div>
  );
};

export default React.memo(UserDataTable); 