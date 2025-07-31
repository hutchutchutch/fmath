import React, { useEffect, useState, useCallback } from 'react';
import TrackProgress from './ProgressGrid';
import { UserProgress } from '../../types/progress';
import { getUserProgress, getUserProgressAssessments, getSession, GetSessionResponse, getProgressMetrics, getTimeToCompletion, DailyGoalsResponse } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiPlay, FiBook, FiLock, FiTarget, FiZap } from 'react-icons/fi';
import Logo from '../common/Logo';
import AssessmentAlert from './AssessmentAlert';
import ProgressMetrics from './ProgressMetrics';
import TimeToCompletion from './TimeToCompletion';
import { AxiosError } from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Fact } from '../Learn/types';
import { LoadingProvider, useLoading } from '../../context/LoadingContext';
import TrackCompletionAlert from './TrackCompletionAlert';
import { CQPM_TARGETS, FLUENCY_TARGETS, TRACK_NAMES, TRACK_LENGTHS } from '../../types/constants';
import { useSession } from '../../context/SessionContext';
import DailyGoals from './DailyGoals';
import FocusTrackAlert from './FocusTrackAlert';

const LoadingOverlay: React.FC<{ loadingComponentsCount: number }> = ({ loadingComponentsCount }) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center"
  >
    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
    <p className="text-lg text-gray-600">Loading...</p>
  </motion.div>
);

const DashboardContent: React.FC = () => {
  const { user } = useAuth();
  const { recordPageTransition } = useSession();
  const [allTracks, setAllTracks] = useState<UserProgress[]>([]);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(() => {
    // First check if user has a specific focus track (not ALL)
    if (user?.focusTrack && user.focusTrack !== 'ALL' && Object.keys(TRACK_NAMES).includes(user.focusTrack)) {
      return user.focusTrack;
    }
    
    // Then check if there's a stored track ID in session
    const storedTrackId = sessionStorage.getItem('activeTrackId');
    if (storedTrackId && Object.keys(TRACK_NAMES).includes(storedTrackId)) {
      return storedTrackId;
    }
    
    // Otherwise, set default based on user's grade
    if (user?.ageGrade !== undefined) {
      switch (user.ageGrade) {
        case 0: return 'TRACK12'; // Addition Within 10 for Grade 0 (same as Grade 1)
        case 1: return 'TRACK12'; // Addition Within 10 for Grade 1
        case 2: return 'TRACK9';  // Addition (Single-Digit Addends) for Grade 2
        case 3: return 'TRACK11'; // Multiplication (Single-digit factors) for Grade 3
        default: return 'TRACK5'; // Default to Division Facts for Grade 4+
      }
    }
    
    // Default to TRACK5 if no grade or other criteria met
    return 'TRACK5';
  });
  const [error, setError] = useState<string | null>(null);
  const [masteredFactsCounts, setMasteredFactsCounts] = useState<Record<string, number>>({});
  const [hasCompletedAssessment, setHasCompletedAssessment] = useState(false);
  const [showCompletionAlert, setShowCompletionAlert] = useState(false);
  const [sessionData, setSessionData] = useState<GetSessionResponse | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [targetAchievedComplete, setTargetAchievedComplete] = useState(false);
  const [showFocusTrackAlert, setShowFocusTrackAlert] = useState(false);
  const [completionTriggerType, setCompletionTriggerType] = useState<'facts_mastered' | 'cqpm_achieved'>('facts_mastered');

  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading, registerLoadingComponent, setComponentLoading, loadingComponentsCount } = useLoading();
  const [progressMetricsData, setProgressMetricsData] = useState<any>(null);
  const [timeToCompletionData, setTimeToCompletionData] = useState<any>(null);
  const [dailyGoalsData, setDailyGoalsData] = useState<DailyGoalsResponse | null>(null);

  const markCompletionAlertAsShown = () => {
    setShowCompletionAlert(false);
    setTargetAchievedComplete(false);
  };

  const handleTargetAchieved = () => {
    setTargetAchievedComplete(true);
    setShowCompletionAlert(true);
  };

  // Check if we should show the focus track alert for first-time users
  const checkAndShowFocusTrackAlert = useCallback(() => {
    if (!user?.userId || !user?.focusTrack) return;
    
    // Check if user has seen the welcome alert before
    const alertKey = `focusTrackAlert_${user.userId}`;
    const hasSeenAlert = localStorage.getItem(alertKey);
    
    // Show if they haven't seen it before and have a focus track (including "ALL")
    if (!hasSeenAlert) {
      setShowFocusTrackAlert(true);
    }
  }, [user?.userId, user?.focusTrack]);

  const handleFocusTrackAlertContinue = () => {
    if (user?.userId) {
      // Mark alert as seen for this user
      localStorage.setItem(`focusTrackAlert_${user.userId}`, 'true');
    }
    setShowFocusTrackAlert(false);
  };

  useEffect(() => {
    const componentId = 'dashboard-main';
    registerLoadingComponent(componentId);

    // Store expandedTrackId in sessionStorage at component mount to ensure it's available for API calls
    if (expandedTrackId) {
      console.log(`[Dashboard] Setting activeTrackId in sessionStorage: ${expandedTrackId}`);
      sessionStorage.setItem('activeTrackId', expandedTrackId);
    }

    const initializeData = async () => {
      if (!user?.userId) {
        setComponentLoading(componentId, false);
        return;
      }

      // Check if user has a focus track, redirect to onboarding if not
      if (!user.focusTrack) {
        console.log('[Dashboard] User has no focus track, redirecting to onboarding');
        navigate('/onboarding');
        return;
      }

      // Check if we should show the focus track alert after confirming user has completed onboarding
      checkAndShowFocusTrackAlert();

      try {
        // Check if there's a preserved trackId in the location state
        if (location.state?.preserveTrackId) {
          const preservedTrackId = location.state.preserveTrackId;
          console.log(`[Dashboard] Preserving track ID from navigation: ${preservedTrackId}`);
          
          // Set the trackId in session storage to ensure consistency
          sessionStorage.setItem('activeTrackId', preservedTrackId);
          
          // Update the expanded track ID if needed
          if (preservedTrackId !== expandedTrackId) {
            setExpandedTrackId(preservedTrackId);
          }
          
          // Clear the preserveTrackId from location state to prevent it from overriding future selections
          // Use replace to update history without adding a new entry
          navigate(location.pathname, { 
            replace: true,
            state: { ...location.state, preserveTrackId: undefined } 
          });
        }
        
        const progressResponse = await getUserProgress(user.userId);
        setAllTracks(progressResponse.tracks);
        
        const assessments = await getUserProgressAssessments(user.userId);
        const currentTrackAssessments = assessments.filter(
          assessment => assessment.trackId === expandedTrackId
        );
        
        setHasCompletedAssessment(
          currentTrackAssessments.some(assessment => assessment.status === 'completed')
        );
        
        const activeTrackId = sessionStorage.getItem('activeTrackId');
        if (activeTrackId && Object.keys(TRACK_NAMES).includes(activeTrackId)) {
          setExpandedTrackId(activeTrackId);
        }

        // Remove session data fetch from here since we're handling it separately
      } catch (err) {
        if (!(err instanceof AxiosError && err.response?.status === 404)) {
          console.error('Error fetching data:', err);
          setError('Failed to load data. Please try again later.');
        }
      } finally {
        setComponentLoading(componentId, false);
      }
    };

    initializeData();
  }, [user?.userId, expandedTrackId, navigate, registerLoadingComponent, setComponentLoading, location.key, location.state, checkAndShowFocusTrackAlert]);

  // No need for cleanup effect to end activity since page transitions are now automatically tracked

  // Update session data when track changes or when navigated to from another page
  useEffect(() => {
    const fetchSessionData = async () => {
      if (!user?.userId) return;
      
      try {
        setIsSessionLoading(true);
        // Use 'learn' parameter to get learning activities and assessment data
        const sessionResponse = await getSession(user.userId, 'learn');
        setSessionData(sessionResponse);
      } catch (err) {
        console.error('Error fetching session data:', err);
      } finally {
        setIsSessionLoading(false);
      }
    };

    fetchSessionData();
  }, [expandedTrackId, user?.userId, location.key]);

  useEffect(() => {
    if (expandedTrackId) {
      // Don't show completion alert if user's focusTrack is ALL
      if (user?.focusTrack === 'ALL') {
        setShowCompletionAlert(false);
        setTargetAchievedComplete(false); // Reset target achieved state for ALL users
      } else if (isTrackComplete(expandedTrackId)) {
        setCompletionTriggerType('facts_mastered');
        setShowCompletionAlert(true);
      } else if (targetAchievedComplete) {
        setCompletionTriggerType('cqpm_achieved');
        setShowCompletionAlert(true);
      } else {
        setShowCompletionAlert(false);
      }
    } else {
      setShowCompletionAlert(false);
    }
  }, [expandedTrackId, masteredFactsCounts, targetAchievedComplete, user?.focusTrack]);

  const handleStartClick = async () => {
    try {
      // Validate activeTrackId is set for users with ALL access
      if (user?.focusTrack === 'ALL') {
        const activeTrackId = sessionStorage.getItem('activeTrackId');
        if (!activeTrackId || !Object.keys(TRACK_NAMES).includes(activeTrackId)) {
          console.error('[Dashboard] Invalid or missing activeTrackId for ALL user');
          setError('Please select a track before starting.');
          return;
        }
      }
      
      // If session data is not loaded yet, fetch it first
      if (!sessionData || isSessionLoading) {
        console.log('[Dashboard] Session data not loaded yet, fetching before starting...');
        setIsSessionLoading(true);
        
        try {
          if (user?.userId) {
            const sessionResponse = await getSession(user.userId, 'learn');
            setSessionData(sessionResponse);
            console.log('[Dashboard] Session data loaded on demand:', 
              'availableActivities:', sessionResponse.availableActivities?.learn?.facts?.length || 0
            );
            
            // After loading, check if we have facts
            if (sessionResponse?.availableActivities?.learn?.facts && 
                sessionResponse.availableActivities.learn.facts.length > 0) {
              navigate('/learn', { 
                state: { 
                  facts: sessionResponse.availableActivities.learn.facts
                } 
              });
              return;
            } else {
              setError('No learning activities available at this time.');
            }
          } else {
            setError('User not logged in. Please log in again.');
          }
        } catch (err) {
          console.error('Error fetching session data on demand:', err);
          setError('Failed to load activities. Please try again.');
        } finally {
          setIsSessionLoading(false);
        }
        return;
      }
      
      // Check if session data is available and has learn facts
      if (sessionData?.availableActivities?.learn?.facts && sessionData.availableActivities.learn.facts.length > 0) {
        // Use facts from session API
        navigate('/learn', { 
          state: { 
            facts: sessionData.availableActivities.learn.facts
          } 
        });
      } else {
        // Show error if no learn facts available
        setError('No learning activities available at this time.');
      }
    } catch (error) {
      console.error('Error in handleStartClick:', error);
      setError('Failed to load facts. Please try again.');
    }
  };

  const getTrackProgress = (trackId: string): UserProgress | undefined => {
    return allTracks.find(track => track.trackId === trackId);
  };

  const getTrackStats = (trackId: string) => {
    const totalFacts = TRACK_LENGTHS[trackId as keyof typeof TRACK_LENGTHS] || 0;
    return { totalFacts, masteredFacts: masteredFactsCounts[trackId] || 0 };
  };

  const handleMasteredFactsCount = useCallback((count: number) => {
    if (!expandedTrackId) return;
    setMasteredFactsCounts(prev => ({
      ...prev,
      [expandedTrackId]: count
    }));
  }, [expandedTrackId]);

  const handleContinueAssessments = () => {
    // Validate activeTrackId is set for users with ALL access
    if (user?.focusTrack === 'ALL') {
      const activeTrackId = sessionStorage.getItem('activeTrackId');
      if (!activeTrackId || !Object.keys(TRACK_NAMES).includes(activeTrackId)) {
        console.error('[Dashboard] Invalid or missing activeTrackId for ALL user');
        setError('Please select a track before starting an assessment.');
        return;
      }
    }
    
    navigate('/progress-assessment', {
      state: { returnTo: 'dashboard' }
    });
  };

  const handleProgressAssessment = () => {
    // Validate activeTrackId is set for users with ALL access
    if (user?.focusTrack === 'ALL') {
      const activeTrackId = sessionStorage.getItem('activeTrackId');
      if (!activeTrackId || !Object.keys(TRACK_NAMES).includes(activeTrackId)) {
        console.error('[Dashboard] Invalid or missing activeTrackId for ALL user');
        setError('Please select a track before starting a progress assessment.');
        return;
      }
    }
    
    navigate('/progress-assessment', {
      state: { returnTo: 'dashboard' }
    });
  };



  const isTrackComplete = (trackId: string): boolean => {
    const { totalFacts, masteredFacts } = getTrackStats(trackId);
    return masteredFacts === totalFacts && totalFacts > 0;
  };

  // Get target CQPM based on user's grade
  const getTargetCQPM = () => {
    if (!user?.ageGrade) return 30; // Default to 30 if grade not available
    return CQPM_TARGETS[user.ageGrade] || 30; // Default to 30 if grade not found in targets
  };

  // Get target fluency level based on user's grade
  const getTargetFluency = () => {
    if (!user?.ageGrade) return 1.5; // Default to 1.5 seconds if grade not available
    return FLUENCY_TARGETS[user.ageGrade] || 1.5; // Default to 1.5 seconds if grade not found in targets
  };

  // Add a new function to fetch both ProgressMetrics and TimeToCompletion data
  const fetchProgressAndTimeData = useCallback(async () => {
    if (!user?.userId) return;
    
    const componentId = 'progress-and-time-data';
    registerLoadingComponent(componentId);
    setComponentLoading(componentId, true);
    
    try {
      // Fetch both data sets in parallel
      const [metricsData, timeData] = await Promise.all([
        getProgressMetrics(user.userId),
        getTimeToCompletion(user.userId)
      ]);
      
      setProgressMetricsData(metricsData);
      setTimeToCompletionData(timeData);
    } catch (err) {
      console.error('Error fetching progress and time data:', err);
    } finally {
      setComponentLoading(componentId, false);
    }
  }, [user?.userId, registerLoadingComponent, setComponentLoading, location.key]);

  // Call the function when the track changes or on navigation
  useEffect(() => {
    if (expandedTrackId) {
      fetchProgressAndTimeData();
    }
  }, [expandedTrackId, fetchProgressAndTimeData, location.key]);

  // Update expandedTrackId when user.focusTrack changes
  useEffect(() => {
    if (user?.focusTrack && user.focusTrack !== 'ALL' && Object.keys(TRACK_NAMES).includes(user.focusTrack)) {
      setExpandedTrackId(user.focusTrack);
      sessionStorage.setItem('activeTrackId', user.focusTrack);
    }
  }, [user?.focusTrack]);

  // Check if a track is locked based on user's focusTrack
  const isTrackLocked = (trackId: string): boolean => {
    if (!user?.focusTrack || user.focusTrack === 'ALL') return false;
    return user.focusTrack !== trackId;
  };

  // Helper function to determine assessment availability and message
  const getAssessmentStatus = () => {
    // Check if assessment is available from backend
    if (!sessionData?.progressAssessment) {
      return {
        available: false,
        message: "No assessments available at this time."
      };
    }

    // Check daily assessment conditions
    const goalsCompleted = dailyGoalsData?.allCompleted;
    const noGoalsExist = dailyGoalsData?.goals && Object.keys(dailyGoalsData.goals).length === 0;
    const hasFreeAssessment = sessionData?.dailyAssessmentCount === 0;

    if (goalsCompleted || noGoalsExist) {
      return {
        available: true,
        message: "You can take unlimited assessments! Your daily goals are complete."
      };
    } else if (hasFreeAssessment) {
      return {
        available: true,
        message: "Take your free daily assessment! Complete goals for unlimited access."
      };
    } else {
      return {
        available: false,
        message: "Complete your daily goals to unlock more attempts, or try again tomorrow."
      };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <AnimatePresence>
        {isLoading && <LoadingOverlay loadingComponentsCount={loadingComponentsCount} />}
      </AnimatePresence>

      {/* Focus Track Alert - Show when user first completes onboarding */}
      {showFocusTrackAlert && (
        <FocusTrackAlert
          trackName={user?.focusTrack === 'ALL' 
            ? null 
            : (expandedTrackId ? TRACK_NAMES[expandedTrackId as keyof typeof TRACK_NAMES] : null)
          }
          onContinue={handleFocusTrackAlertContinue}
          isAllTracks={user?.focusTrack === 'ALL'}
        />
      )}

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-16 px-4 flex items-center justify-center border-b bg-white/50 backdrop-blur-sm"
      >
        <h1 className="text-4xl font-bold animate-fade-in flex items-center gap-3">
          <Logo size={36} />
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
            Fast Math
          </span>
        </h1>
      </motion.div>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-64 border-r bg-white/50 backdrop-blur-sm overflow-y-auto"
        >
          <DailyGoals 
            expandedTrackId={expandedTrackId}
            userProgress={allTracks}
            isLoading={isLoading}
            setDailyGoalsData={setDailyGoalsData}
          />
          
          {/* Show Learning Tracks section if no focus track is set OR focusTrack is ALL */}
          {(!user?.focusTrack || user.focusTrack === 'ALL') && (
            <>
              <div className="border-t"></div>
              
              <div className="p-4">
                <h2 className="text-lg font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <FiBook className="text-blue-500" />
                  Learning Tracks
                </h2>
              </div>
              <nav className="px-2 space-y-1">
                {Object.entries(TRACK_NAMES)
                  .filter(([trackId]) => ['TRACK5', 'TRACK6', 'TRACK7', 'TRACK8'].includes(trackId))
                  .map(([trackId, trackName]) => {
                  const isSelected = expandedTrackId === trackId;
                  const locked = isTrackLocked(trackId);
                  
                  return (
                    <motion.button
                      key={trackId}
                      whileHover={{ scale: locked ? 1 : 1.02 }}
                      whileTap={{ scale: locked ? 1 : 0.98 }}
                      onClick={() => {
                        if (locked) return; // Prevent selection if locked
                        
                        // Always set the track ID in sessionStorage first to ensure it's available for API calls
                        sessionStorage.setItem('activeTrackId', trackId);
                        console.log(`[Dashboard] Track selected - activeTrackId set to: ${trackId}`);
                        
                        // Then update the expanded track
                        setExpandedTrackId(isSelected ? null : trackId);
                      }}
                      className={`w-full text-left p-3 rounded-lg transition-all duration-300
                        ${isSelected ? 'bg-blue-50 text-blue-600 shadow-sm' : 'hover:bg-gray-50'}
                        ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                      title={locked ? "This track is locked." : ""}
                    >
                      <div className="font-medium flex items-center justify-between">
                        <span>{trackName}</span>
                        {locked && <FiLock className="text-gray-500" size={16} />}
                      </div>
                    </motion.button>
                  );
                })}
              </nav>
            </>
          )}
        </motion.div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="h-full flex items-start">
            <AnimatePresence mode="wait">
              {expandedTrackId ? (
                <motion.div 
                  key={expandedTrackId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="w-full max-w-4xl mx-auto p-4 md:p-6"
                >
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg flex items-center justify-between"
                    >
                      <span>{error}</span>
                      <button 
                        onClick={() => setError(null)}
                        className="ml-2 text-red-800 hover:text-red-900 p-1 rounded-full hover:bg-red-100 transition-colors"
                      >
                        ×
                      </button>
                    </motion.div>
                  )}
                  {(() => {
                    if (isTrackComplete(expandedTrackId)) {
                      return (
                        <>
                          <div className="w-[230px] mx-auto">
                            <div className="space-y-4">
                              {/* Hide TimeToCompletion when CQPM exceeds target */}
                              {!(progressMetricsData && progressMetricsData.currentCQPM !== null && 
                                 progressMetricsData.currentCQPM > 0 &&
                                 getTargetCQPM() && 
                                 progressMetricsData.currentCQPM >= getTargetCQPM()) && (
                                <TimeToCompletion 
                                  userId={user?.userId || ''}
                                  isActive={true}
                                  preloadedData={timeToCompletionData}
                                />
                              )}
                              {/* Always show ProgressMetrics */}
                              <ProgressMetrics 
                                userId={user?.userId || ''}
                                targetCQPM={getTargetCQPM()}
                                onProgressAssessment={handleProgressAssessment}
                                isActive={hasCompletedAssessment}
                                preloadedData={progressMetricsData}
                                showRetakeButton={!!(
                                  sessionData?.progressAssessment && 
                                  (dailyGoalsData?.allCompleted || 
                                   (dailyGoalsData?.goals && Object.keys(dailyGoalsData.goals).length === 0))
                                )}
                                onTargetAchieved={handleTargetAchieved}
                                assessmentAvailable={getAssessmentStatus().available}
                                assessmentMessage={getAssessmentStatus().message}
                              />
                            </div>
                          </div>
                          {showCompletionAlert && (
                            <TrackCompletionAlert
                              trackName={TRACK_NAMES[expandedTrackId as keyof typeof TRACK_NAMES]}
                              onContinue={markCompletionAlertAsShown}
                              currentTrackId={expandedTrackId}
                              triggerType={completionTriggerType}
                            />
                          )}
                        </>
                      );
                    }

                    return (
                      <div className="flex flex-col lg:flex-row gap-6">
                        <div className="flex-1">
                          <div className="space-y-6">
                            <TrackProgress
                              onStartClick={handleStartClick}
                              onMasteredFactsCount={handleMasteredFactsCount}
                              trackId={expandedTrackId!}
                              targetFluency={getTargetFluency()}
                            />
                            
                            {/* Action Buttons */}
                            <div className="flex gap-4">
                              {(() => {
                                // New: Determine if there are any facts left to learn (needed for edge-case logic)
                                const hasFactsToLearn = !!(sessionData?.availableActivities?.learn?.facts &&
                                  sessionData.availableActivities.learn.facts.length > 0);

                                const practiceGoalsIncomplete = (
                                  (dailyGoalsData?.goals?.learning && dailyGoalsData.goals.learning.completed < dailyGoalsData.goals.learning.total) ||
                                  (dailyGoalsData?.goals?.accuracy && dailyGoalsData.goals.accuracy.completed < dailyGoalsData.goals.accuracy.total) ||
                                  (dailyGoalsData?.goals?.fluency && dailyGoalsData.goals.fluency.completed < dailyGoalsData.goals.fluency.total)
                                );

                                const assessmentGoalIncomplete = (
                                  dailyGoalsData?.goals?.assessment !== undefined &&
                                  dailyGoalsData.goals.assessment.completed < dailyGoalsData.goals.assessment.total
                                );

                                // Show assessment button when all practice goals are complete AND we either
                                //   1) still have an assessment goal to finish, OR
                                //   2) have no more facts to learn (edge-case)
                                const showAssessmentButton = !practiceGoalsIncomplete && (
                                  assessmentGoalIncomplete || !hasFactsToLearn
                                );

                                if (showAssessmentButton) {
                                  return (
                                    <motion.button
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={handleContinueAssessments}
                                      className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg shadow-md transition-all duration-300 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:shadow-lg cursor-pointer"
                                    >
                                      <FiZap className="text-white" size={20} />
                                      <span className="font-medium">Start Next Assessment</span>
                                    </motion.button>
                                  );
                                }
                                
                                // Check if there are facts to learn from session data
                                // (variable already defined earlier to avoid redeclaration)
                                // const hasFactsToLearn = sessionData?.availableActivities?.learn?.facts && 
                                //                        sessionData.availableActivities.learn.facts.length > 0;
                                
                                return (
                                  <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={hasFactsToLearn ? handleStartClick : () => navigate('/accuracy-practice')}
                                    disabled={isSessionLoading}
                                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
                                  >
                                    {isSessionLoading ? (
                                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                    ) : (
                                      <FiPlay className="text-white" size={20} />
                                    )}
                                    <span className="font-medium">{isSessionLoading ? "Loading..." : "Start"}</span>
                                  </motion.button>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                        {/* Always show ProgressMetrics and TimeToCompletion for testing */}
                        <div className="w-full lg:w-[230px]">
                          {isSessionLoading ? (
                            <div className="bg-white p-4 rounded-lg shadow-md animate-pulse">
                              <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                              <div className="h-4 bg-gray-200 rounded w-full mb-3"></div>
                              <div className="h-4 bg-gray-200 rounded w-5/6 mb-3"></div>
                              <div className="h-10 bg-gray-200 rounded w-full mt-4"></div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {/* Hide TimeToCompletion when CQPM exceeds target */}
                              {!(progressMetricsData && progressMetricsData.currentCQPM !== null && 
                                 progressMetricsData.currentCQPM > 0 &&
                                 getTargetCQPM() && 
                                 progressMetricsData.currentCQPM >= getTargetCQPM()) && (
                                <TimeToCompletion 
                                  userId={user?.userId || ''}
                                  isActive={true}
                                  preloadedData={timeToCompletionData}
                                />
                              )}
                              {/* Always show ProgressMetrics */}
                              <ProgressMetrics 
                                userId={user?.userId || ''}
                                targetCQPM={getTargetCQPM()}
                                onProgressAssessment={handleProgressAssessment}
                                isActive={hasCompletedAssessment}
                                preloadedData={progressMetricsData}
                                showRetakeButton={!!(
                                  sessionData?.progressAssessment && 
                                  (dailyGoalsData?.allCompleted || 
                                   (dailyGoalsData?.goals && Object.keys(dailyGoalsData.goals).length === 0))
                                )}
                                onTargetAchieved={handleTargetAchieved}
                                assessmentAvailable={getAssessmentStatus().available}
                                assessmentMessage={getAssessmentStatus().message}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {showCompletionAlert && (
                    <TrackCompletionAlert
                      trackName={TRACK_NAMES[expandedTrackId as keyof typeof TRACK_NAMES]}
                      onContinue={markCompletionAlertAsShown}
                      currentTrackId={expandedTrackId}
                      triggerType={completionTriggerType}
                    />
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-4"
                >
                  <FiBook size={48} className="text-gray-400" />
                  <p className="text-lg">Select a track to view progress</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  return (
    <LoadingProvider>
      <DashboardContent />
    </LoadingProvider>
  );
};

export default Dashboard;