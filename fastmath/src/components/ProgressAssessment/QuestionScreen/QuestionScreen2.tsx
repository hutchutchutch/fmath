import React, { useState, useEffect, useRef, useMemo } from 'react';
import TextInput from './inputs/TextInput';
import Timer from '../../ui/Timer';
import TestTimer from '../../ui/TestTimer';
import { Settings, PracticeResults } from '../types';
import { Question } from '../../../types';
import { FactStatus } from '../../../types/progress';
import { useAuth } from '../../../context/AuthContext';
import { updateProgressAssessment, completeProgressAssessment, updateTypingSpeed } from '../../../config/api';
import { logError } from '../../../utils/errorReporting';
import { progressQueue } from '../../../services/ProgressQueueService';

interface QuestionScreenProps {
  onEnd: (results: PracticeResults) => void;
  settings: Settings;
  questions: Question[];
}

const QuestionScreen2: React.FC<QuestionScreenProps> = ({ onEnd, settings, questions: initialQuestions }) => {
  // All state hooks first
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isProcessingEnd, setIsProcessingEnd] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [currentTimerZone, setCurrentTimerZone] = useState<'green' | 'yellow'>('green');
  const isSubmitting = useRef<boolean>(false);
  const { user } = useAuth();

  // Add test start time ref
  const testStartTime = useRef<number>(Date.now());

  // Keep refs for non-voice inputs
  const questionsAnsweredRef = useRef(questionsAnswered);
  const correctAnswersRef = useRef(correctAnswers);

  // Add ref for storing typing data
  const typingDataQueue = useRef<Array<{ count: number; time: number }>>([]);

  // Add ref to track progress update promises
  const progressUpdatePromises = useRef<Promise<any>[]>([]);
  const isMounted = useRef(true);

  const totalTypingTimeDeducted = useRef<number>(0);
  const totalTransitionTime = useRef<number>(0);
  const lastTransitionStartTime = useRef<number>(0);

  // Remove the interval-based timer refs and just keep the duration constant
  const totalTestDuration = 2 * 60 * 1000; // 2 minutes in milliseconds

  // Calculate target time for current question
  const currentTargetTime = useMemo(() => {
    if (!initialQuestions[currentIndex]) return settings.baseTime;
    
    // Count digits in the answer
    const digits = initialQuestions[currentIndex].answer.toString().length;
    
    // For 1 digit answers, use base time only
    // For multi-digit answers, add (digits-1) * timePerDigit
    return digits === 1 
      ? settings.baseTime 
      : settings.baseTime + ((digits - 1) * settings.timePerDigit);
  }, [currentIndex, initialQuestions, settings.baseTime, settings.timePerDigit]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (progressUpdatePromises.current.length > 0) {
        Promise.all(progressUpdatePromises.current).catch(error => {
          logError(error, {
            component: 'ProgressAssessment-QuestionScreen',
            userId: user?.userId
          });
        });
      }
    };
  }, []);

  useEffect(() => {
    questionsAnsweredRef.current = questionsAnswered;
  }, [questionsAnswered]);

  useEffect(() => {
    correctAnswersRef.current = correctAnswers;
  }, [correctAnswers]);

  const handlePracticeEnd = async () => {
    try {
      if (isProcessingEnd) return;
      setIsProcessingEnd(true);

      if (!user?.userId) {
        throw new Error('No authenticated user found');
      }

      // We don't need to wait for progress updates to complete
      // since we're using the queue system now
      // The queue will handle retries and persistence

      // Calculate actual test duration in minutes
      const testDurationMs = Date.now() - testStartTime.current;
      const testDurationMinutes = testDurationMs / 60000;

      // Retry logic for completing the assessment
      const MAX_ATTEMPTS = 5;
      let attempts = 0;
      let assessmentResult: any = null;

      while (attempts < MAX_ATTEMPTS && !assessmentResult) {
        try {
          assessmentResult = await completeProgressAssessment(settings.assessmentId, user.userId, {
            totalTypingTimeDeducted: totalTypingTimeDeducted.current,
            totalTransitionTime: totalTransitionTime.current,
            actualDurationMinutes: testDurationMinutes,
            clientSideStats: {
              totalAttempts: questionsAnswered,
              totalCorrect: correctAnswers
            },
            testType: 'QuestionTimer'
          });
        } catch (error) {
          attempts++;
          logError(error, {
            component: 'ProgressAssessment-QuestionScreen-Retry',
            userId: user?.userId,
            attempt: attempts
          });

          // If not the last attempt, wait a bit before retrying (simple backoff)
          if (attempts < MAX_ATTEMPTS) {
            await new Promise(res => setTimeout(res, attempts * 1000));
          }
        }
      }

      if (assessmentResult) {

        // Process any typing data if available
        if (typingDataQueue.current.length > 0 && user?.userId) {
          try {
            const totalCount = typingDataQueue.current.reduce((sum, data) => sum + data.count, 0);
            const totalTime = typingDataQueue.current.reduce((sum, data) => sum + data.time, 0);

            if (totalCount > 0 && totalTime > 0) {
              // Use the queue for typing speed updates
              progressQueue.enqueueTypingUpdate(
                user.userId, 
                {
                  count: totalCount,
                  time: totalTime / totalCount
                }
              );
            }
          } catch (error) {
            logError(error, {
              component: 'ProgressAssessment-QuestionScreen-TypingData',
              userId: user?.userId
            });
          }
        }

        const results: PracticeResults = {
          cqpm: Math.round(assessmentResult.overallCQPM),
          accuracy: assessmentResult.accuracyRate,
          totalQuestions: initialQuestions.length,
          totalAttempted: questionsAnswered,
          correctAnswers: correctAnswers
        };

        setIsProcessingEnd(false);
        onEnd(results);
      } else {
        // After all retries have failed, log and show fallback results
        logError(new Error('Failed to complete assessment after max retries'), {
          component: 'ProgressAssessment-QuestionScreen',
          userId: user?.userId,
          attempts: MAX_ATTEMPTS
        });

        const results: PracticeResults = {
          cqpm: 0,
          totalQuestions: initialQuestions.length,
          totalAttempted: questionsAnswered,
          correctAnswers: correctAnswers,
          accuracy: 0
        };

        setIsProcessingEnd(false);
        onEnd(results);
      }
    } catch (error) {
      logError(error, {
        component: 'ProgressAssessment-QuestionScreen',
        userId: user?.userId
      });
      
      // Return zeros but allow user to continue
      const results: PracticeResults = {
        cqpm: 0,
        totalQuestions: initialQuestions.length,
        totalAttempted: questionsAnswered,
        correctAnswers: correctAnswers,
        accuracy: 0
      };
      setIsProcessingEnd(false);
      onEnd(results);
    }
  };

  const determineFactStatus = (isCorrect: boolean, timeSpentMs: number): FactStatus => {
    if (!isCorrect) {
      return 'learning';
    }
    
    // Convert milliseconds to seconds for comparison
    const timeSpentSeconds = timeSpentMs / 1000;
    
    if (timeSpentSeconds > 6) {
      return 'accuracyPractice';
    } else if (timeSpentSeconds > 3) {
      return 'fluency6Practice';
    } else if (timeSpentSeconds > 2) {
      return 'fluency3Practice';
    } else if (timeSpentSeconds > 1.5) {
      return 'fluency2Practice';
    } else {
      return 'mastered';
    }
  };

  const handleAnswer = async (answer: number, typingData?: { count: number; time: number }) => {
    if (!initialQuestions[currentIndex]) {
      console.warn('No current question found');
      return;
    }

    // Check if total test time has elapsed
    const totalTimeElapsed = Date.now() - testStartTime.current;
    if (totalTimeElapsed >= totalTestDuration) {
      handlePracticeEnd();
      return;
    }

    const currentQuestion = initialQuestions[currentIndex];
    const isCorrect = answer === currentQuestion.answer;
    const totalTimeSpentMs = Date.now() - questionStartTime;
    
    // Calculate and subtract the extra time given for digits
    const digitCount = currentQuestion.answer.toString().length;
    const digitTimeMs = digitCount > 1
      ? (digitCount - 1) * settings.timePerDigit * 1000 // Only deduct for digits beyond the first one
      : 0; // No deduction for 1 digit answers
    const adjustedTimeSpentMs = Math.max(100, totalTimeSpentMs - digitTimeMs);
    
    // Track total typing time deducted
    totalTypingTimeDeducted.current += digitTimeMs;
    
    // Start tracking transition time
    lastTransitionStartTime.current = Date.now();

    // Queue typing data for batch processing if available
    if (typingData && isCorrect) {
      typingDataQueue.current.push(typingData);
    }

    // Handle answer based on timer zone
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      setShowFeedback(true);
      setTimeout(() => {
        // Calculate and add transition time
        const transitionEndTime = Date.now();
        totalTransitionTime.current += transitionEndTime - lastTransitionStartTime.current;
        
        setShowFeedback(false);
        setCurrentTimerZone('green');
        setCurrentIndex(currentIndex + 1);
        setQuestionStartTime(Date.now());
      }, 100);
    } else {
      setShowFeedback(true);
      setTimeout(() => {
        // Calculate and add transition time
        const transitionEndTime = Date.now();
        totalTransitionTime.current += transitionEndTime - lastTransitionStartTime.current;
        
        setShowFeedback(false);
        setCurrentTimerZone('green');
        setCurrentIndex(currentIndex + 1);
        setQuestionStartTime(Date.now());
      }, 100);
    }

    // Increment questions answered counter
    setQuestionsAnswered(prev => prev + 1);
    
    if (user?.userId) {
      try {
        const factId = currentQuestion.id.split('FACT#')[1];
        if (!factId) {
          throw new Error('Invalid fact ID format');
        }

        // 1. Use progress queue for assessment updates instead of direct API call
        progressQueue.enqueueProgressAssessmentUpdate(
          user.userId,
          settings.assessmentId,
          {
            [currentQuestion.id]: {
              attempts: 1,
              correct: isCorrect ? 1 : 0,
              timeSpent: adjustedTimeSpentMs
            }
          }
        );
        
        // No need to store promises for queued updates
        // We still need to keep the cleanup mechanism in handlePracticeEnd though

        const factStatus = determineFactStatus(isCorrect, adjustedTimeSpentMs);

        // 2. Update user progress using queue - without fact status
        progressQueue.enqueueProgressUpdate(
          user.userId, 
          {
            facts: {
              [factId]: {
                attempts: 1,
                correct: isCorrect ? 1 : 0,
                timeSpent: adjustedTimeSpentMs,
                status: factStatus
              }
            }
          }
        );
        


      } catch (error) {
        logError(error, {
          component: 'ProgressAssessment-QuestionScreen-UpdateProgress',
          userId: user?.userId,
          factId: currentQuestion?.id,
          assessmentId: settings.assessmentId
        });
      }
    }
  };

  const handleTimerZoneChange = (zone: 'green' | 'yellow') => {
    setCurrentTimerZone(zone);
  };

  // Update questionStartTime when moving to a new question
  useEffect(() => {
    if (initialQuestions[currentIndex]) {
      setQuestionStartTime(Date.now());
    } else if (currentIndex >= initialQuestions.length && !isProcessingEnd) {
      handlePracticeEnd();
    }
  }, [currentIndex]);

  if (!initialQuestions || initialQuestions.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div>No questions available</div>
      </div>
    );
  }

  if (!initialQuestions[currentIndex]) {
    return null;
  }

  if (isProcessingEnd) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-6 flex flex-col items-center gap-4">
          <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-xl font-medium text-gray-600">Processing final results...</div>
        </div>
      </div>
    );
  }

  const currentQuestion = initialQuestions[currentIndex];

  const inputProps = {
    question: currentQuestion,
    onAnswer: handleAnswer,
    showFeedback,
    currentQuestionIndex: currentIndex,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6 flex items-center">
      <div className="max-w-4xl w-full mx-auto space-y-6">
        <TestTimer 
          onComplete={handlePracticeEnd}
          isActive={!isSubmitting.current}
        />
        <Timer 
          key={currentIndex}
          duration={currentTargetTime}
          onTimeout={() => handleAnswer(-1)}
          onZoneChange={handleTimerZoneChange}
          isActive={!isSubmitting.current}
        />

        {/* Question Card */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <TextInput {...inputProps} />
        </div>
      </div>
    </div>
  );
};

export default QuestionScreen2; 