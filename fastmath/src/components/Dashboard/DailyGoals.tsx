import React, { useEffect, useState } from 'react';
import { UserProgress } from '../../types/progress';
import { useAuth } from '../../context/AuthContext';
import { FiTarget, FiAward, FiStar, FiAlertTriangle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { getDailyGoals, updateDailyGoalProgress, DailyGoalsResponse, DailyGoalsApiResponse } from '../../config/api';
import { logError } from '../../utils/errorReporting';

interface DailyGoalsProps {
  expandedTrackId: string | null;
  userProgress: UserProgress[];
  isLoading?: boolean;
  setDailyGoalsData?: React.Dispatch<React.SetStateAction<any>>;
}

const DailyGoals: React.FC<DailyGoalsProps> = ({ expandedTrackId, userProgress = [], isLoading = false, setDailyGoalsData }) => {
  const { user } = useAuth();
  const [showCelebration, setShowCelebration] = useState(false);
  const [dailyGoalsData, setDailyGoalsDataState] = useState<DailyGoalsResponse | null>(null);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [minutesUntilReset, setMinutesUntilReset] = useState(0);
  
  // Check if we should show the reset warning (10 minutes before midnight local time)
  useEffect(() => {
    const checkResetWarning = () => {
      const now = new Date();
      const localHours = now.getHours();
      const localMinutes = now.getMinutes();
      
      // Show warning if it's between 23:50 and 23:59 local time
      if (localHours === 23 && localMinutes >= 50) {
        const minutesLeft = 60 - localMinutes;
        setMinutesUntilReset(minutesLeft);
        setShowResetWarning(true);
      } else {
        setShowResetWarning(false);
      }
    };
    
    // Check immediately
    checkResetWarning();
    
    // Check every minute
    const interval = setInterval(checkResetWarning, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Clean up old celebration entries in localStorage
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone
    
    // Get all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Only process celebration keys
      if (key && key.startsWith('celebration_') && !key.includes(today)) {
        localStorage.removeItem(key);
      }
    }
  }, []);
  
  // Single consolidated hook to fetch daily goals data from API
  useEffect(() => {
    if (!expandedTrackId || isLoading) return;
    
    const fetchDailyGoals = async () => {
      try {
        setLoadingGoals(true);
        console.log(`[DailyGoals] Fetching goals for track: ${expandedTrackId}`);
        const response = await getDailyGoals(expandedTrackId);
        console.log(`[DailyGoals] Received goals data:`, response);
        
        // Validate the data has the expected structure before setting state
        if (response && typeof response === 'object') {
          // Extract the actual goals data from either format
          const goalsData: DailyGoalsResponse = 'success' in response && response.data 
            ? response.data 
            : response as DailyGoalsResponse;
          
          setDailyGoalsDataState(goalsData);
          // Share with parent component if provided
          if (setDailyGoalsData) {
            setDailyGoalsData(goalsData);
          }
          
          // Show celebration if all goals are completed
          if (goalsData.allCompleted) {
            // Check if we've already shown the celebration today
            const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone
            const celebrationKey = `celebration_${today}_${expandedTrackId}`;
            const celebrationShown = localStorage.getItem(celebrationKey);
            
            if (!celebrationShown && !isLoading) {
              const timer = setTimeout(() => {
                setShowCelebration(true);
                // Mark celebration as shown to avoid showing it multiple times in the same day
                localStorage.setItem(celebrationKey, 'true');
              }, 800);
              
              return () => clearTimeout(timer);
            }
          }
        } else {
          console.error('[DailyGoals] Invalid goals data format:', response);
          // Log to Sentry only for invalid data format
          logError(new Error('Invalid goals data format'), {
            component: 'DailyGoals',
            trackId: expandedTrackId
          });
        }
      } catch (error) {
        console.error('[DailyGoals] Failed to fetch daily goals:', error);
        // Log API exception to Sentry
        logError(error, {
          component: 'DailyGoals',
          trackId: expandedTrackId
        });
      } finally {
        setLoadingGoals(false);
      }
    };
    
    fetchDailyGoals();
  }, [expandedTrackId, userProgress, isLoading, setDailyGoalsData]);

  // Auto-hide celebration after a delay
  useEffect(() => {
    if (showCelebration) {
      const timer = setTimeout(() => {
        setShowCelebration(false);
      }, 6000);
      
      return () => clearTimeout(timer);
    }
  }, [showCelebration]);

  // Map daily goals from API to the goals array format
  const goals = !dailyGoalsData ? [] : [
    ...(dailyGoalsData.goals.learning ? [{
      title: `Learn ${dailyGoalsData.goals.learning.total} new facts`,
      completed: dailyGoalsData.goals.learning.completed,
      total: dailyGoalsData.goals.learning.total,
      type: 'learning' as const
    }] : []),
    ...(dailyGoalsData.goals.accuracy ? [{
      title: `Prove 100% accuracy in ${dailyGoalsData.goals.accuracy.total} facts`,
      completed: dailyGoalsData.goals.accuracy.completed,
      total: dailyGoalsData.goals.accuracy.total,
      type: 'accuracy' as const
    }] : []),
    ...(dailyGoalsData.goals.fluency ? [{
      title: `Prove 100% fluency in ${dailyGoalsData.goals.fluency.total} facts`,
      completed: dailyGoalsData.goals.fluency.completed,
      total: dailyGoalsData.goals.fluency.total,
      type: 'fluency' as const
    }] : []),
    ...(dailyGoalsData.goals.assessment ? [{
      title: `Complete ${dailyGoalsData.goals.assessment.total} assessment${dailyGoalsData.goals.assessment.total > 1 ? 's' : ''}`,
      completed: dailyGoalsData.goals.assessment.completed,
      total: dailyGoalsData.goals.assessment.total,
      type: 'assessment' as const
    }] : [])
  ];

  // If there are no goals, don't show anything
  if (goals.length === 0 && !loadingGoals) {
    return null;
  }

  const allGoalsCompleted = dailyGoalsData?.allCompleted || false;

  // Function to handle goal progress update
  const handleGoalIncrement = async (goalType: 'learning' | 'accuracy' | 'fluency' | 'assessment') => {
    if (!expandedTrackId) return;
    
    try {
      console.log(`[DailyGoals] Updating goal progress for ${goalType}`);
      const response = await updateDailyGoalProgress(expandedTrackId, goalType);
      
      if (response && typeof response === 'object') {
        // Extract the actual goals data from either format
        const updatedGoals: DailyGoalsResponse = 'success' in response && response.data 
          ? response.data 
          : response as DailyGoalsResponse;
        
        setDailyGoalsDataState(updatedGoals);
        // Share with parent component if provided
        if (setDailyGoalsData) {
          setDailyGoalsData(updatedGoals);
        }
        
        // Check if all goals are completed after update
        if (updatedGoals.allCompleted && !dailyGoalsData?.allCompleted) {
          const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone
          const celebrationKey = `celebration_${today}_${expandedTrackId}`;
          const celebrationShown = localStorage.getItem(celebrationKey);
          
          if (!celebrationShown) {
            setShowCelebration(true);
            localStorage.setItem(celebrationKey, 'true');
          }
        }
      } else {
        console.error('[DailyGoals] Invalid updated goals data format:', response);
        // Log to Sentry only for invalid data format
        logError(new Error('Invalid updated goals data format'), {
          component: 'DailyGoals',
          trackId: expandedTrackId,
          goalType
        });
      }
    } catch (error) {
      console.error('[DailyGoals] Failed to update goal progress:', error);
      // Log API exception to Sentry
      logError(error, {
        component: 'DailyGoals',
        trackId: expandedTrackId,
        goalType
      });
    }
  };

  return (
    <div className="px-1">
      <div className="p-4">
        <h2 className="text-lg font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <FiTarget className="text-green-500" />
          Today's Goals
        </h2>
      </div>
      
      {/* Reset Warning */}
      {showResetWarning && (
        <div className="mx-2 mb-3">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <FiAlertTriangle className="text-orange-500 text-sm flex-shrink-0" />
              <p className="text-xs text-orange-700">
                <span className="font-medium">Heads up!</span> Daily goals reset in {minutesUntilReset} minute{minutesUntilReset !== 1 ? 's' : ''} (midnight local time). 
                Complete your goals now to earn today's star!
              </p>
            </div>
          </motion.div>
        </div>
      )}
      
      <nav className="px-2 space-y-1 mb-2">
        {loadingGoals ? (
          <div className="w-full text-center p-3">
            <span className="text-sm text-gray-500">Loading goals...</span>
          </div>
        ) : (
          goals.map((goal, index) => {
            const isCompleted = goal.completed === goal.total;
            return (
              <div 
                key={index} 
                className={`w-full text-left p-3 rounded-lg transition-all duration-300 ${isCompleted ? 'bg-gray-50' : ''}`}
                style={{ cursor: 'default' }}
              >
                <div className="font-medium flex items-center justify-between">
                  <span className={`text-sm ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {goal.title}
                  </span>
                  <div className="flex items-center gap-1">
                    {Array(goal.total).fill(0).map((_, i) => (
                      <div
                        key={i}
                        className={`w-3 h-3 rounded-full ${i < goal.completed ? 'bg-green-500' : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </nav>
      
      {/* Completion Message */}
      <div className="mx-2 my-3">
        {allGoalsCompleted ? (
          <motion.div
            initial={{ opacity: 0.8, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg px-3 py-2"
          >
            <div className="flex items-center justify-center gap-2">
              <motion.div
                animate={{ 
                  rotate: [0, 10, -10, 10, 0],
                  scale: [1, 1.1, 1, 1.1, 1]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <FiStar className="text-yellow-400 text-lg" />
              </motion.div>
              <p className="text-sm font-medium text-green-600">
                Congratulations, you completed a star session!
              </p>
            </div>
          </motion.div>
        ) : (
          <p className="text-xs text-gray-500 italic text-center">
            Complete all to win a star session!
          </p>
        )}
      </div>
      
      {/* Celebration Animation */}
      <AnimatePresence>
        {showCelebration && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
            
            <motion.div
              initial={{ scale: 0.5, y: 20 }}
              animate={{ 
                scale: 1, 
                y: 0,
              }}
              exit={{ scale: 0.8, y: 10, opacity: 0 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 15 
              }}
              className="z-10 bg-white rounded-2xl shadow-2xl border-4 border-green-500 p-8 max-w-md w-full mx-4"
            >
              <div className="relative flex flex-col items-center">
                {/* Star with glow effect */}
                <motion.div
                  animate={{ 
                    rotate: [0, 15, -15, 15, 0],
                    scale: [1, 1.1, 1, 1.1, 1]
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="relative mb-6"
                >
                  <div className="absolute inset-0 rounded-full bg-yellow-300 filter blur-xl opacity-50 scale-150" />
                  <FiStar className="text-yellow-400 text-8xl relative z-10" />
                </motion.div>
                
                {/* Title with gradient animation */}
                <motion.h2 
                  className="text-3xl font-bold mb-3 text-center bg-clip-text text-transparent"
                  style={{
                    backgroundImage: "linear-gradient(90deg, #10b981, #3b82f6, #ec4899, #10b981)",
                    backgroundSize: "300% 100%"
                  }}
                  animate={{ 
                    backgroundPosition: ["0% 0%", "100% 0%", "0% 0%"]
                  }}
                  transition={{ duration: 5, repeat: Infinity }}
                >
                  Congratulations!
                </motion.h2>
                
                <p className="text-gray-700 text-xl text-center font-medium mb-4">
                  You've completed all of today's goals!
                </p>
                
                <p className="text-gray-500 text-sm text-center">
                  Keep up the great work to maintain your learning streak!
                </p>
              </div>
              
              {/* Confetti effect */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {Array.from({ length: 100 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute"
                    style={{
                      top: '-5%',
                      left: `${Math.random() * 100}%`,
                      width: `${Math.random() * 8 + 4}px`,
                      height: `${Math.random() * 8 + 4}px`,
                      backgroundColor: ['#10b981', '#3b82f6', '#ec4899', '#f59e0b', '#8b5cf6', '#f43f5e', '#fbbf24'][i % 7],
                      borderRadius: Math.random() > 0.5 ? '50%' : '0',
                      rotate: `${Math.random() * 360}deg`
                    }}
                    animate={{
                      y: ['0vh', '120vh'],
                      x: [0, Math.random() * 100 - 50],
                      rotate: ['0deg', `${Math.random() * 360 * (Math.random() > 0.5 ? 1 : -1)}deg`]
                    }}
                    transition={{
                      duration: 3 + Math.random() * 5,
                      ease: "easeOut",
                      delay: Math.random() * 0.5
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DailyGoals; 