import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { FiArrowLeft, FiUser, FiBarChart2, FiInfo, FiClock, FiGrid, FiChevronRight, FiChevronDown, FiArrowRight } from 'react-icons/fi';
import { CircularProgress } from '@mui/material';
import { getUserSessionAnalytics, getProgressMetrics, getActiveStudents, getUserSessionsLastWeek, getTrackFacts, getUserProgress, updateUserFocusTrack } from '../../config/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format, subDays, parseISO } from 'date-fns';
import StudentProgressGrid from './StudentProgressGrid';
import { Fact } from '../Learn/types';

import { UserProgress } from '../../types/progress';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface StudentDataProps {
  userId: string;
  name: string;
  email: string;
  onBack: () => void;
  studentData?: Student; // Optional full student data that can be passed from parent
}

interface CQPMData {
  date: string;
  cqpm: number;
}

interface CQPMHistoryEntry {
  date: string;
  cqpm: number;
}

interface TrackData {
  latestCQPM: number;
  previousCQPM: number | null;
  cqpmHistory: Array<CQPMHistoryEntry>;
}

interface Student {
  name: string;
  email: string;
  tracks: {
    [trackId: string]: TrackData;
  };
  sessionData: any;
  accuracyFacts: {
    accuracyPractice: number;
    fluency1_5Practice: number;
  };
  focusTrack?: string;
}

interface SessionData {
  userId: string;
  sessionId: string;
  trackId: string;
  startTime: string;
  endTime: string;
  totalDuration: number;
  learningTime: number;
  accuracyPracticeTime: number;
  fluency6PracticeTime?: number;
  fluency3PracticeTime?: number;
  fluency2PracticeTime?: number;
  fluency1_5PracticeTime?: number;
  fluency1PracticeTime?: number;
  assessmentTime: number;
  otherTime: number;
  pageTransitions: Array<{
    timestamp: string;
    page: string;
  }>;
}

interface SessionsByDate {
  [date: string]: SessionData[];
}

// Track names mapping
const TRACK_NAMES: Record<string, string> = {
  'TRACK1': 'Addition',
  'TRACK2': 'Subtraction',
  'TRACK3': 'Multiplication',
  'TRACK4': 'Division',
  'TRACK5': 'Division (Quotient ≤12)',
  'TRACK6': 'Addition (≤20)',
  'TRACK7': 'Multiplication (≤12)',
  'TRACK8': 'Subtraction (≤20)'
};

// Focus track options and display names
const FOCUS_TRACK_OPTIONS = [
  { id: 'TRACK5', name: 'Division' },
  { id: 'TRACK6', name: 'Addition' },
  { id: 'TRACK7', name: 'Multiplication' },
  { id: 'TRACK8', name: 'Subtraction' }
];

// Focus track display mapping
const FOCUS_TRACK_NAMES: Record<string, string> = {
  'TRACK5': 'Division',
  'TRACK6': 'Addition',
  'TRACK7': 'Multiplication',
  'TRACK8': 'Subtraction'
};

interface CQPMInfo {
  latestCQPM: number | null;
  previousCQPM: number | null;
  change: number | null;
  noAssessmentData: boolean;
}

const StudentData: React.FC<StudentDataProps> = ({ userId, name, email, onBack, studentData: initialStudentData }) => {
  const [loading, setLoading] = useState(!initialStudentData);
  const [error, setError] = useState<string | null>(null);
  
  // Student data
  const [grade, setGrade] = useState<string>('5'); // Placeholder - would come from API
  const [cqpmData, setCqpmData] = useState<CQPMData[]>([]);
  const [studentData, setStudentData] = useState<Student | null>(initialStudentData || null);
  const [availableTracks, setAvailableTracks] = useState<string[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string>('');
  
  // State for focus track
  const [focusTrack, setFocusTrack] = useState<string>('');
  const [changingFocusTrack, setChangingFocusTrack] = useState(false);
  const [focusTrackError, setFocusTrackError] = useState<string | null>(null);
  const [showFocusTrackConfirm, setShowFocusTrackConfirm] = useState(false);

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [sessionsByDate, setSessionsByDate] = useState<SessionsByDate>({});
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [expandedPageTransitions, setExpandedPageTransitions] = useState<Record<string, boolean>>({});

  // New state variables for progress grid
  const [facts, setFacts] = useState<Fact[]>([]);
  const [trackFluencyMap, setTrackFluencyMap] = useState<any>(null);
  const [trackProgress, setTrackProgress] = useState<UserProgress | null>(null);
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStudentData = async () => {
      // If data was passed from parent, no need to fetch again
      if (initialStudentData) {
        processStudentData(initialStudentData);
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        // Only fetch if data wasn't passed from parent
        const activeStudents = await getActiveStudents();
        const student = activeStudents[userId];
        
        if (!student) {
          throw new Error('Student data not found');
        }
        
        processStudentData(student);
      } catch (err) {
        console.error('Error fetching student data:', err);
        setError('Failed to load student data');
      } finally {
        setLoading(false);
      }
    };
    
    // Helper function to process student data (whether fetched or passed in)
    const processStudentData = (student: Student) => {
      setStudentData(student);
      
      // Get unique tracks from assessment data
      const tracksFromAssessments = Object.keys(student.tracks || {});
      
      // Set this to process session data once it's loaded
      setAvailableTracks(tracksFromAssessments);
      
      if (tracksFromAssessments.length > 0) {
        setSelectedTrackId(tracksFromAssessments[0]);
      }
      
      // Set focus track if available
      if (student.focusTrack) {
        setFocusTrack(student.focusTrack);
      }
    };
    
    fetchStudentData();
  }, [userId, initialStudentData]);
  
  // Load CQPM data whenever the selected track changes
  useEffect(() => {
    if (!studentData || !selectedTrackId) return;
    
    const track = studentData.tracks[selectedTrackId];
    
    if (track?.cqpmHistory && track.cqpmHistory.length > 0) {
      // Use real CQPM history from the API - already averaged per day by the backend
      const cqpmHistoryData: CQPMData[] = track.cqpmHistory.map((entry: CQPMHistoryEntry) => ({
        date: entry.date, // Already in YYYY-MM-DD format
        cqpm: entry.cqpm  // Already averaged for the day
      }));
      
      setCqpmData(cqpmHistoryData);
    } else {
      // No assessment data available
      setCqpmData([]);
    }
  }, [selectedTrackId, studentData]);
  
  // Fetch sessions data
  useEffect(() => {
    const fetchSessions = async () => {
      setSessionsLoading(true);
      setSessionsError(null);
      
      try {
        const sessionsData = await getUserSessionsLastWeek(userId);
        setSessions(sessionsData || []);
        
        // Group sessions by date
        const groupedSessions: SessionsByDate = {};
        
        // Track unique trackIds from sessions
        const trackIdsFromSessions = new Set<string>();
        
        sessionsData.forEach((session: SessionData) => {
          const sessionDate = format(new Date(session.startTime), 'yyyy-MM-dd');
          
          if (!groupedSessions[sessionDate]) {
            groupedSessions[sessionDate] = [];
          }
          
          groupedSessions[sessionDate].push(session);
          
          // Add trackId to the set if it exists
          if (session.trackId) {
            trackIdsFromSessions.add(session.trackId);
          }
        });
        
        setSessionsByDate(groupedSessions);
        
        // Update available tracks to include tracks from sessions, ensuring uniqueness
        setAvailableTracks(prevTracks => {
          // Create a Set from both previous tracks and new tracks to ensure uniqueness
          const uniqueTracks = new Set([...prevTracks, ...Array.from(trackIdsFromSessions)]);
          const allTracks = Array.from(uniqueTracks);
          
          // If we have tracks but no selected track yet, select the first one
          if (allTracks.length > 0 && !selectedTrackId) {
            setSelectedTrackId(allTracks[0]);
          }
          
          return allTracks;
        });
        
        // Set today's date to be expanded by default
        const today = format(new Date(), 'yyyy-MM-dd');
        const initialExpandedState: Record<string, boolean> = {};
        
        Object.keys(groupedSessions).forEach(date => {
          initialExpandedState[date] = date === today;
        });
        
        setExpandedDates(initialExpandedState);
      } catch (err) {
        console.error('Error fetching session data:', err);
        setSessionsError('Failed to load session data');
      } finally {
        setSessionsLoading(false);
      }
    };
    
    fetchSessions();
  }, [userId, selectedTrackId]);
  
  // Add new useEffect to fetch progress grid data when selected track changes
  useEffect(() => {
    if (!userId || !selectedTrackId) return;
    
    const fetchProgressData = async () => {
      setGridLoading(true);
      setGridError(null);
      
      try {
        // Store selectedTrackId in sessionStorage 
        sessionStorage.setItem('activeTrackId', selectedTrackId);
        
        // Fetch track facts and user progress (simplified without fluency map)
        const [trackFacts, progressData] = await Promise.all([
          getTrackFacts(selectedTrackId), // Explicitly pass the selectedTrackId
          getUserProgress(userId)
        ]);
        
        setFacts(trackFacts);
        setTrackFluencyMap(null); // No longer using fluency map
        
        // Find the progress for the current track
        const currentTrackProgress = progressData.tracks.find((track: any) => track.trackId === selectedTrackId);
        if (currentTrackProgress) {
          setTrackProgress(currentTrackProgress);
          
          // Calculate progress percentage based on mastered facts (simplified)
          if (trackFacts.length > 0) {
            let masteredFactsCount = 0;
            const totalVisibleFacts = trackFacts.length;
            
            trackFacts.forEach((fact: any) => {
              const factProgress = currentTrackProgress.facts[fact.factId];
              
              // Simplified mastery criteria - just check if status is 'mastered'
              if (factProgress && factProgress.status === 'mastered') {
                masteredFactsCount++;
              }
            });
            
            // Calculate progress percentage based on individual facts
            const percentage = totalVisibleFacts > 0 ? (masteredFactsCount / totalVisibleFacts) * 100 : 0;
            setProgressPercentage(percentage);
          }
        }
      } catch (err) {
        console.error('Error fetching progress data:', err);
        setGridError('Failed to load progress data');
      } finally {
        setGridLoading(false);
      }
    };
    
    fetchProgressData();
  }, [userId, selectedTrackId]);
  
  // Handle track selection change
  const handleTrackChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newTrackId = event.target.value;
    // Reset grid-related state when changing tracks
    setFacts([]);
    setTrackFluencyMap(null);
    setTrackProgress(null);
    setProgressPercentage(0);
    setGridLoading(true);
    // Set the new track ID
    setSelectedTrackId(newTrackId);
  };
  
  // Handle focus track confirmation and change
  const handleUpdateFocusTrack = async () => {
    setChangingFocusTrack(true);
    setFocusTrackError(null);
    
    try {
      const response = await updateUserFocusTrack(userId);
      
      if (response.success) {
        // Display a success message that instructs the user to refresh the page
        setFocusTrackError('Focus Track was updated successfully. Refresh the page to see the latest value.');
        setTimeout(() => {
          if (setFocusTrackError) {
            setFocusTrackError(null);
          }
        }, 5000);
      } else {
        setFocusTrackError(response.message || 'Failed to update focus track');
      }
    } catch (error) {
      console.error('Error changing focus track:', error);
      setFocusTrackError('An error occurred while updating focus track');
    } finally {
      setChangingFocusTrack(false);
      setShowFocusTrackConfirm(false);
    }
  };
  
  // Get focus track display name
  const getFocusTrackDisplayName = (trackId: string): string => {
    return FOCUS_TRACK_NAMES[trackId] || trackId;
  };
  
  // Chart options and data
  const cqpmChartData = {
    labels: cqpmData.map(d => format(new Date(d.date), 'MMM dd')),
    datasets: [
      {
        label: 'CQPM',
        data: cqpmData.map(d => d.cqpm),
        backgroundColor: 'rgba(59, 130, 246, 0.7)', // blue-500 with transparency
        borderColor: 'rgba(37, 99, 235, 1)', // blue-600
        borderWidth: 1,
        borderRadius: 4,
        barThickness: 20,
      },
    ],
  };
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: {
            size: 12,
            family: "'Inter', sans-serif",
          },
          color: '#4b5563', // gray-600
        }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#1f2937', // gray-800
        bodyColor: '#4b5563', // gray-600
        borderColor: '#e5e7eb', // gray-200
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          title: function(context: any) {
            return context[0].label;
          },
          label: function(context: any) {
            const label = context.dataset.label || '';
            const value = context.raw;
            return `${label}: ${value.toFixed(1)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(229, 231, 235, 0.5)', // gray-200 with transparency
        },
        ticks: {
          font: {
            size: 11,
          },
          color: '#6b7280', // gray-500
          callback: function(value: any) {
            return value;
          }
        }
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 11,
          },
          color: '#6b7280', // gray-500
        }
      }
    }
  };
  
  // Get the latest and previous CQPM for display
  const getLatestCQPMInfo = (): CQPMInfo => {
    if (!studentData || !selectedTrackId) {
      return { latestCQPM: null, previousCQPM: null, change: null, noAssessmentData: true };
    }
    
    // Check if the track exists in the studentData
    const tracks = studentData.tracks || {};
    const track = tracks[selectedTrackId];
    
    if (!track) {
      // If the track is in availableTracks but not in studentData.tracks,
      // it means the user has sessions for this track but no assessment data
      return { 
        latestCQPM: null, 
        previousCQPM: null, 
        change: null,
        noAssessmentData: true 
      };
    }
    
    // Calculate absolute change between latest and previous CQPM
    let change = null;
    if (track.latestCQPM !== null && track.previousCQPM !== null) {
      change = track.latestCQPM - track.previousCQPM;
    }
    
    return {
      latestCQPM: track.latestCQPM,
      previousCQPM: track.previousCQPM,
      change,
      noAssessmentData: false
    };
  };
  
  const cqpmInfo = getLatestCQPMInfo();
  
  // Get the display name for the selected track
  const getSelectedTrackName = () => {
    if (!selectedTrackId) return 'No Track Selected';
    return TRACK_NAMES[selectedTrackId] || selectedTrackId;
  };
  
  // Helper function to format session time
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  };
  
  // Helper function to get color for page type
  const getPageColor = (page: string): string => {
    const colorMap: Record<string, string> = {
      'learn': 'bg-green-100 text-green-800',
      'accuracy-practice': 'bg-blue-100 text-blue-800',
      'fluency-practice': 'bg-purple-100 text-purple-800',
      'assessment': 'bg-amber-100 text-amber-800',
      'dashboard': 'bg-gray-100 text-gray-800',
      'other': 'bg-gray-100 text-gray-800'
    };
    
    return colorMap[page] || 'bg-gray-100 text-gray-800';
  };
  
  // Helper to get a readable name for page type
  const getPageName = (page: string): string => {
    const nameMap: Record<string, string> = {
      'learn': 'Learning',
      'accuracy-practice': 'Accuracy Practice',
      'fluency-practice': 'Fluency Practice',
      'assessment': 'Assessment',
      'dashboard': 'Dashboard',
      'other': 'Other'
    };
    
    return nameMap[page] || page;
  };
  
  // Function to toggle expanded state of a date
  const toggleDateExpanded = (date: string) => {
    setExpandedDates(prev => ({
      ...prev,
      [date]: !prev[date]
    }));
  };
  
  // Function to toggle expanded state of page transitions for a session
  const togglePageTransitionsExpanded = (sessionId: string) => {
    setExpandedPageTransitions(prev => ({
      ...prev,
      [sessionId]: !prev[sessionId]
    }));
  };
  
  // Function to calculate totals for a specific date
  const getDateTotals = (date: string) => {
    // Filter sessions by selected track if one is selected
    const sessionsForDate = sessionsByDate[date] || [];
    const filteredSessions = selectedTrackId 
      ? sessionsForDate.filter(session => session.trackId === selectedTrackId)
      : sessionsForDate;
    
    return filteredSessions.reduce((totals, session) => {
      return {
        totalTime: totals.totalTime + session.totalDuration,
        learningTime: totals.learningTime + session.learningTime,
        accuracyTime: totals.accuracyTime + session.accuracyPracticeTime,
        fluencyTime: totals.fluencyTime + 
          (session.fluency6PracticeTime || 0) + 
          (session.fluency3PracticeTime || 0) + 
          (session.fluency2PracticeTime || 0) + 
          (session.fluency1_5PracticeTime || 0) + 
          (session.fluency1PracticeTime || 0),
        assessmentTime: totals.assessmentTime + session.assessmentTime,
        sessionCount: totals.sessionCount + 1
      };
    }, {
      totalTime: 0,
      learningTime: 0,
      accuracyTime: 0,
      fluencyTime: 0,
      assessmentTime: 0,
      sessionCount: 0
    });
  };
  
  // Get the track name from track ID
  const getTrackName = (trackId: string): string => {
    return TRACK_NAMES[trackId] || trackId;
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <CircularProgress size={40} thickness={4} sx={{ color: '#3b82f6' }} />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 text-red-500 text-base text-center">
        {error}
        <Button variant="outline" onClick={onBack} className="mt-4">
          <FiArrowLeft className="mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 mx-4 my-6">
      {/* Back button */}
      <div>
        <Button variant="outline" onClick={onBack} className="mb-2">
          <FiArrowLeft className="mr-2" /> Back to Students
        </Button>
      </div>
      
      {/* Personal Info */}
      <Card className="rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300">
        <CardContent className="p-4">
          <h2 className="text-xl font-semibold text-blue-700 flex items-center mb-3">
            <FiUser className="mr-2" /> Personal Information
          </h2>
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs font-medium text-gray-500">Name</div>
              <div className="text-sm font-semibold">{name}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500">Email</div>
              <div className="text-sm">{email}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500">Grade</div>
              <div className="text-sm">{grade}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500">Focus Track</div>
              {focusTrack ? (
                <div className="flex flex-col">
                  <div className="flex items-center">
                    <div className="text-sm font-medium mr-2">{getFocusTrackDisplayName(focusTrack)}</div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowFocusTrackConfirm(true)}
                      disabled={changingFocusTrack || showFocusTrackConfirm}
                      className="text-xs py-1 h-auto flex items-center"
                    >
                      Move to Next Track <FiArrowRight className="ml-1" size={12} />
                    </Button>
                  </div>
                  
                  {/* Confirmation dialog */}
                  {showFocusTrackConfirm && (
                    <div className="mt-2 p-2 border border-amber-200 bg-amber-50 rounded-md text-xs">
                      <p className="font-medium text-amber-800 mb-1">
                        Move student to the next track?
                      </p>
                      <p className="text-gray-600 mb-2">This will change the student's learning path. This action cannot be undone.</p>
                      <div className="flex gap-2">
                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={handleUpdateFocusTrack}
                          disabled={changingFocusTrack}
                          className="text-xs py-1 h-auto"
                        >
                          {changingFocusTrack ? (
                            <><CircularProgress size={12} className="mr-1" /> Updating...</>
                          ) : (
                            'Confirm'
                          )}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setShowFocusTrackConfirm(false)}
                          disabled={changingFocusTrack}
                          className="text-xs py-1 h-auto"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {focusTrackError && (
                    <div className={`text-xs mt-1 ${focusTrackError.includes('Success') ? 'text-green-500' : 'text-red-500'}`}>
                      {focusTrackError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500">Not set</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Track Selector */}
      {availableTracks.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-gray-700">Select Track:</div>
          <select
            value={selectedTrackId}
            onChange={handleTrackChange}
            className="ml-2 border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {availableTracks.map(trackId => (
              <option key={trackId} value={trackId}>
                {TRACK_NAMES[trackId] || trackId}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {/* CQPM Summary */}
      <Card className="rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300">
        <CardContent className="p-4">
          <h2 className="text-xl font-semibold text-blue-700 flex items-center mb-3">
            <FiBarChart2 className="mr-2" /> CQPM Summary: {getSelectedTrackName()}
          </h2>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
              <div className="text-xs font-medium text-gray-500">Latest CQPM</div>
              <div className="text-2xl font-bold text-blue-600">
                {cqpmInfo.latestCQPM !== null ? cqpmInfo.latestCQPM.toFixed(1) : '-'}
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div className="text-xs font-medium text-gray-500">Previous CQPM</div>
              <div className="text-2xl font-bold text-gray-600">
                {cqpmInfo.previousCQPM !== null ? cqpmInfo.previousCQPM.toFixed(1) : '-'}
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${cqpmInfo.change && cqpmInfo.change > 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <div className="text-xs font-medium text-gray-500">
                Change from Previous
              </div>
              <div className={`text-2xl font-bold ${cqpmInfo.change && cqpmInfo.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {cqpmInfo.change !== null ? (cqpmInfo.change > 0 ? '+' : '') + cqpmInfo.change.toFixed(1) : '-'}
              </div>
            </div>
          </div>
          
          {cqpmInfo.noAssessmentData && (
            <div className="mt-3 p-2 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-800">
              <div className="flex items-center">
                <FiInfo className="mr-2 flex-shrink-0" />
                <span>No assessment data available for this track. Student has worked on this track but hasn't completed any assessments yet.</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Progress Grid */}
      <Card className="rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300">
        <CardContent className="p-4">
          <h2 className="text-xl font-semibold text-blue-700 flex items-center mb-3">
            <FiGrid className="mr-2" /> Progress Grid: {getSelectedTrackName()}
          </h2>
          <StudentProgressGrid
            userId={userId}
            trackId={selectedTrackId}
            userProgress={trackProgress}
            facts={facts}
            progressPercentage={progressPercentage}
            isLoading={gridLoading}
          />
        </CardContent>
      </Card>
      
      {/* Sessions Timeline */}
      <Card className="rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300">
        <CardContent className="p-4">
          <h2 className="text-xl font-semibold text-blue-700 flex items-center mb-3">
            <FiClock className="mr-2" /> Sessions Timeline (Last 7 Days)
            {selectedTrackId && (
              <span className="ml-2 text-xs text-gray-500">
                Filtered by: {getTrackName(selectedTrackId)}
              </span>
            )}
          </h2>
          
          {sessionsLoading ? (
            <div className="flex justify-center items-center min-h-[150px]">
              <CircularProgress size={24} thickness={4} sx={{ color: '#3b82f6' }} />
            </div>
          ) : sessionsError ? (
            <div className="p-3 rounded-lg bg-red-50 text-red-500 text-center text-xs border border-red-100">
              {sessionsError}
            </div>
          ) : Object.keys(sessionsByDate).length === 0 ? (
            <div className="p-3 text-gray-500 text-center text-xs bg-gray-50 rounded-lg border border-gray-200">
              No session data available for the last 7 days.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.keys(sessionsByDate)
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()) // Sort dates newest first
                .map(date => {
                  const dateTotals = getDateTotals(date);
                  const isExpanded = expandedDates[date] || false;
                  const today = format(new Date(), 'yyyy-MM-dd');
                  const isToday = date === today;
                  
                  // Filter sessions by selected track if one is selected
                  const sessionsToShow = selectedTrackId
                    ? sessionsByDate[date].filter(session => session.trackId === selectedTrackId)
                    : sessionsByDate[date];
                    
                  // Skip dates with no sessions after filtering
                  if (sessionsToShow.length === 0) return null;
                  
                  return (
                    <div key={date} className="border rounded-lg overflow-hidden shadow-sm">
                      <div 
                        className={`p-2 flex flex-wrap items-center justify-between ${isToday ? 'bg-blue-50 border-b border-blue-100' : 'bg-gray-50 border-b border-gray-200'} cursor-pointer`}
                        onClick={() => toggleDateExpanded(date)}
                      >
                        <div className="flex items-center">
                          <div className="mr-1 text-gray-500">
                            {isExpanded ? (
                              <FiChevronDown size={16} />
                            ) : (
                              <FiChevronRight size={16} />
                            )}
                          </div>
                          <h3 className={`font-medium text-xs ml-1 ${isToday ? 'text-blue-700' : 'text-gray-800'}`}>
                            {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                            {isToday && <span className="ml-1 text-xs px-1 py-0.5 bg-blue-100 text-blue-800 rounded-full">Today</span>}
                          </h3>
                        </div>
                        
                        <div className="flex items-center space-x-3 text-xs">
                          <div>
                            <span className="font-medium">{dateTotals.sessionCount}</span> 
                            <span className="text-gray-500 ml-0.5">{dateTotals.sessionCount === 1 ? 'session' : 'sessions'}</span>
                          </div>
                          <div>
                            <span className="font-medium">{formatDuration(dateTotals.totalTime)}</span> 
                            <span className="text-gray-500 ml-0.5">total</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Activity summary pills - always visible */}
                      <div className="px-2 py-1 bg-white flex flex-wrap gap-1 border-b border-gray-100">
                        {dateTotals.learningTime > 0 && (
                          <div className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">
                            Learning: {formatDuration(dateTotals.learningTime)}
                          </div>
                        )}
                        {dateTotals.accuracyTime > 0 && (
                          <div className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                            Accuracy: {formatDuration(dateTotals.accuracyTime)}
                          </div>
                        )}
                        {dateTotals.fluencyTime > 0 && (
                          <div className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-medium">
                            Fluency: {formatDuration(dateTotals.fluencyTime)}
                          </div>
                        )}
                        {dateTotals.assessmentTime > 0 && (
                          <div className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                            Assessment: {formatDuration(dateTotals.assessmentTime)}
                          </div>
                        )}
                      </div>
                      
                      {/* Expanded session list */}
                      {isExpanded && (
                        <div className="p-2 space-y-2 bg-white">
                          {sessionsToShow.map(session => (
                            <div key={session.sessionId} className="bg-gray-50 p-3 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors duration-150">
                              <div className="flex flex-wrap items-center justify-between mb-2">
                                <div className="font-medium text-gray-800 text-xs">
                                  {format(new Date(session.startTime), 'h:mm a')} - 
                                  {format(new Date(session.endTime), 'h:mm a')}
                                  <span className="ml-1 px-2 py-0.5 text-[10px] bg-blue-100 text-blue-800 rounded-full font-medium">
                                    {getTrackName(session.trackId)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-700 font-medium">
                                    Total time: {formatDuration(session.totalDuration)}
                                  </div>
                                  <div className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-700 font-medium">
                                    Active time: {formatDuration(
                                      session.learningTime +
                                      session.accuracyPracticeTime +
                                      (session.fluency6PracticeTime || 0) +
                                      (session.fluency3PracticeTime || 0) +
                                      (session.fluency2PracticeTime || 0) +
                                      (session.fluency1_5PracticeTime || 0) +
                                      (session.fluency1PracticeTime || 0) +
                                      session.assessmentTime
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Activity breakdown */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                                {session.learningTime > 0 && (
                                  <div className="text-[10px] bg-green-100 text-green-800 px-2 py-1 rounded font-medium flex items-center justify-center">
                                    Learning: {formatDuration(session.learningTime)}
                                  </div>
                                )}
                                {session.accuracyPracticeTime > 0 && (
                                  <div className="text-[10px] bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium flex items-center justify-center">
                                    Accuracy: {formatDuration(session.accuracyPracticeTime)}
                                  </div>
                                )}
                                {(session.fluency6PracticeTime || 0) + 
                                 (session.fluency3PracticeTime || 0) + 
                                 (session.fluency2PracticeTime || 0) + 
                                 (session.fluency1_5PracticeTime || 0) + 
                                 (session.fluency1PracticeTime || 0) > 0 && (
                                  <div className="text-[10px] bg-purple-100 text-purple-800 px-2 py-1 rounded font-medium flex items-center justify-center">
                                    Fluency: {formatDuration(
                                      (session.fluency6PracticeTime || 0) + 
                                      (session.fluency3PracticeTime || 0) + 
                                      (session.fluency2PracticeTime || 0) + 
                                      (session.fluency1_5PracticeTime || 0) + 
                                      (session.fluency1PracticeTime || 0)
                                    )}
                                  </div>
                                )}
                                {session.assessmentTime > 0 && (
                                  <div className="text-[10px] bg-amber-100 text-amber-800 px-2 py-1 rounded font-medium flex items-center justify-center">
                                    Assessment: {formatDuration(session.assessmentTime)}
                                  </div>
                                )}
                              </div>
                              
                              {/* Page transitions */}
                              <div className="text-[10px] text-gray-700 mt-2 p-2 rounded-lg border border-gray-100">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">Pages visited: </span>
                                  {session.pageTransitions.length > 5 && (
                                    <button 
                                      onClick={() => togglePageTransitionsExpanded(session.sessionId)}
                                      className="text-blue-600 hover:text-blue-800 text-[10px] font-medium"
                                    >
                                      {expandedPageTransitions[session.sessionId] ? 'Show less' : 'Show all'}
                                    </button>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {session.pageTransitions
                                    .slice(0, expandedPageTransitions[session.sessionId] ? undefined : 5)
                                    .map((transition, idx) => (
                                      <span 
                                        key={idx} 
                                        className={`px-2 py-0.5 rounded-full ${getPageColor(transition.page)} font-medium`}
                                      >
                                        {getPageName(transition.page)}
                                      </span>
                                    ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }).filter(Boolean)} {/* Filter out null entries (dates with no matching sessions) */}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* CQPM Chart */}
      <Card className="rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300">
        <CardContent className="p-4">
          <h2 className="text-xl font-semibold text-blue-700 flex items-center mb-3">
            <FiBarChart2 className="mr-2" /> CQPM History: {getSelectedTrackName()}
            <span className="ml-2 text-[10px] text-gray-500 flex items-center">
              <FiInfo className="mr-1" size={10} /> 
              Multiple assessments on the same day are averaged
            </span>
          </h2>
          {cqpmData.length > 0 ? (
            <>
              <div style={{ height: '250px' }}>
                <Bar data={cqpmChartData} options={chartOptions} />
              </div>
              
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 rounded-lg overflow-hidden border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {cqpmData.map((data, index) => (
                        <th key={index} className="px-4 py-2 text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                          {format(new Date(data.date), 'MMM dd')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      {cqpmData.map((data, index) => (
                        <td key={index} className="px-4 py-2 whitespace-nowrap text-xs text-center font-medium text-blue-600">
                          {data.cqpm.toFixed(1)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
              <FiInfo className="mx-auto mb-2" size={20} />
              <p className="text-sm">No assessment data available for this track yet.</p>
              <p className="text-xs mt-1 text-gray-400">CQPM history will appear here after the student completes assessments.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentData; 