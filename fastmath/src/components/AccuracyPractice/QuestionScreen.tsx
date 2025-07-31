import React, { useState, useEffect, useRef, useMemo } from 'react';
import { QuestionTextInput as TextInput } from '../ui/input';
import CorrectAnswerInput from '../ui/CorrectAnswer';
import { useAuth } from '../../context/AuthContext';
import { setUserProgress } from '../../config/api';
import { SetUserProgressRequest } from '../../types/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ProgressBar from './ProgressBar';
import { Fact } from '../../types';
import AccuracyTextInput from './AccuracyTextInput';
import { logError } from '../../utils/errorReporting';
import { progressQueue } from '../../services/ProgressQueueService';

// Fact mastery utilities
const PRACTICE_MASTERY_THRESHOLD = 3;
const OTHER_MASTERY_THRESHOLD = 1;
const MAX_ATTEMPTS_PER_FACT = 5;

interface QuestionScreenProps {
  questions: Fact[];
  practiceFacts: string[]; // Array of PK values for practice facts
  otherFacts: string[]; // Array of PK values for other facts
  onComplete: () => void;
}

const QuestionScreen: React.FC<QuestionScreenProps> = ({ 
  questions: facts, 
  practiceFacts,
  otherFacts,
  onComplete 
}) => {
  const navigate = useNavigate();
  const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';
  
  // State hooks
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isProcessingEnd, setIsProcessingEnd] = useState(false);
  const [showCorrectAnswerInput, setShowCorrectAnswerInput] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [key, setKey] = useState(0);
  const [factAttempts, setFactAttempts] = useState<Record<string, {
    attempts: number;
    correct: number;
    timeSpent: number;
  }>>({});
  // Simple state to track mastery progress for each fact
  const [factProgress, setFactProgress] = useState<Record<string, number>>({});
  const [masteredFacts, setMasteredFacts] = useState<Set<string>>(new Set());
  // Add a ref to track recently shown facts
  const recentlyShownFactsRef = useRef<string[]>([]);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(false);
  
  const { user } = useAuth();

  // Calculate total repetitions needed for all facts
  const totalRepetitionsNeeded = useMemo(() => {
    return facts.reduce((total, fact) => {
      const isPracticeFact = practiceFacts.includes(fact.PK);
      const threshold = isPracticeFact ? PRACTICE_MASTERY_THRESHOLD : OTHER_MASTERY_THRESHOLD;
      return total + threshold;
    }, 0);
  }, [facts, practiceFacts]);

  // Calculate current progress toward mastery
  const currentMasteryProgress = useMemo(() => {
    const totalProgress = Object.entries(factProgress).reduce((total, [factId, progress]) => {
      const isPracticeFact = practiceFacts.includes(factId);
      const threshold = isPracticeFact ? PRACTICE_MASTERY_THRESHOLD : OTHER_MASTERY_THRESHOLD;
      // Only cap the upper limit per question
      const cappedProgress = Math.min(progress, threshold);
      return total + cappedProgress;
    }, 0);
    
    // Apply the minimum of 0 to the total instead
    return Math.max(totalProgress, 0);
  }, [factProgress, practiceFacts]);

  // Function to determine if a fact is mastered based on its group
  const isMastered = (factId: string, correctAnswers: number) => {
    const isPracticeFact = practiceFacts.includes(factId);
    
    if (isPracticeFact) {
      return correctAnswers >= PRACTICE_MASTERY_THRESHOLD;
    } else {
      return correctAnswers >= OTHER_MASTERY_THRESHOLD;
    }
  };



  // Refs
  const testId = useRef(crypto.randomUUID());
  const questionsAnsweredRef = useRef(questionsAnswered);
  const correctAnswersRef = useRef(correctAnswers);
  const isSubmitting = useRef<boolean>(false);
  const progressUpdatePromises = useRef<Promise<any>[]>([]);
  const isMounted = useRef(true);
  const questionStartTime = useRef<number>(Date.now());
  const showAnswerTimer = useRef<NodeJS.Timeout | null>(null);

  // Convert facts to questions format
  const questions = useMemo(() => {
    return facts.map(fact => ({
      id: fact.PK,
      num1: fact.operand1,
      num2: fact.operand2,
      operator: fact.operation === 'addition' ? '+' : 
                fact.operation === 'subtraction' ? '−' : 
                fact.operation === 'multiplication' ? '×' : '÷',
      answer: fact.result
    }));
  }, [facts]);

  // Initialize factAttempts and factProgress
  useEffect(() => {
    const initialFactAttempts: Record<string, {
      attempts: number;
      correct: number;
      timeSpent: number;
    }> = {};
    
    const initialProgress: Record<string, number> = {};
    
    questions.forEach(question => {
      const factId = question.id;
      initialFactAttempts[factId] = {
        attempts: 0,
        correct: 0,
        timeSpent: 0
      };
      initialProgress[factId] = 0;
    });
    
    setFactAttempts(initialFactAttempts);
    setFactProgress(initialProgress);
  }, [questions]);

  // Update refs when state changes
  useEffect(() => {
    questionsAnsweredRef.current = questionsAnswered;
  }, [questionsAnswered]);

  useEffect(() => {
    correctAnswersRef.current = correctAnswers;
  }, [correctAnswers]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (progressUpdatePromises.current.length > 0) {
        Promise.all(progressUpdatePromises.current).catch(error => {
          console.error('[Cleanup Error]:', error);
        });
      }
      if (showAnswerTimer.current) {
        clearTimeout(showAnswerTimer.current);
      }
    };
  }, []);

  // Update questionStartTime when moving to a new question
  useEffect(() => {
    if (facts[currentIndex]) {
      questionStartTime.current = Date.now();
      
      // Set a timer to show the answer after 12 seconds
      showAnswerTimer.current = setTimeout(() => {
        if (!showCorrectAnswerInput) {
          setShowCorrectAnswerInput(true);
        }
      }, 12000); // 12 seconds
      
      return () => {
        if (showAnswerTimer.current) {
          clearTimeout(showAnswerTimer.current);
        }
      };
    }
  }, [currentIndex, facts, showCorrectAnswerInput]);

  // Add a debugging useEffect
  useEffect(() => {
    console.log('QuestionScreen state update:', { 
      showFeedback, 
      lastAnswerCorrect,
      currentIndex
    });
  }, [showFeedback, lastAnswerCorrect, currentIndex]);

  // Add a useEffect for mount/unmount logging
  useEffect(() => {
    console.log('[QuestionScreen] Component mounted', {
      questionCount: facts.length,
      currentIndex,
      timestamp: new Date().toISOString(),
      testId: testId.current,
      userId: user?.userId || 'unknown'
    });
    
    // Add global error handlers to catch unhandled errors
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[CRITICAL] Unhandled Promise Rejection in QuestionScreen:', event.reason, {
        timestamp: new Date().toISOString(),
        userId: user?.userId || 'unknown',
        currentPath: window.location.pathname,
        component: 'QuestionScreen'
      });
    };

    const handleError = (event: ErrorEvent) => {
      console.error('[CRITICAL] Unhandled Error in QuestionScreen:', event.error, {
        timestamp: new Date().toISOString(),
        message: event.message,
        userId: user?.userId || 'unknown',
        currentPath: window.location.pathname,
        component: 'QuestionScreen'
      });
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      console.log('[QuestionScreen] Page is about to unload/reload', {
        timestamp: new Date().toISOString(),
        testId: testId.current,
        userId: user?.userId || 'unknown', 
        currentQuestion: facts[currentIndex]?.PK || 'unknown',
        correctAnswers,
        questionsAnswered,
        currentIndex,
        progressState: JSON.stringify(factProgress),
        masteredFactsCount: masteredFacts.size
      });
    };

    // Add the event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      console.log('[QuestionScreen] Component unmounting', {
        timestamp: new Date().toISOString(),
        testId: testId.current,
        userId: user?.userId || 'unknown',
        factsLength: facts.length
      });
    };
  }, []);
  
  // Log when facts or currentIndex changes
  useEffect(() => {
    console.log('[QuestionScreen] Facts or currentIndex changed', {
      factsLength: facts.length,
      currentIndex,
      currentQuestion: facts[currentIndex]?.PK || 'none',
      timestamp: new Date().toISOString()
    });
  }, [facts, currentIndex]);

  const handlePracticeEnd = async () => {
    try {
      if (isProcessingEnd) return;
      setIsProcessingEnd(true);

      // Wait for all progress updates to complete
      if (progressUpdatePromises.current.length > 0) {
        await Promise.all(progressUpdatePromises.current);
      }

      setIsProcessingEnd(false);
      onComplete();
    } catch (error) {
      console.error('[QuestionScreen] Error handling practice end:', error);
      
      // Log the error using our utility
      logError(error, {
        component: 'AccuracyPractice-QuestionScreen',
        trackId,
        userId: user?.userId,
        pendingUpdates: progressUpdatePromises.current.length
      });
      
      // Allow user to continue despite the error
      setIsProcessingEnd(false);
      onComplete();
    }
  };

  const handleAnswer = async (answer: number) => {
    if (!facts[currentIndex] || isTransitioning) {
      console.warn('No current question found or transition in progress');
      return;
    }

    // Clear the show answer timer
    if (showAnswerTimer.current) {
      clearTimeout(showAnswerTimer.current);
      showAnswerTimer.current = null;
    }

    const currentQuestion = facts[currentIndex];
    const isCorrect = answer === currentQuestion.result;
    
    // Set lastAnswerCorrect first, before setting showFeedback
    setLastAnswerCorrect(isCorrect);
    
    console.log('QuestionScreen handleAnswer:', { 
      userAnswer: answer, 
      correctAnswer: currentQuestion.result, 
      isCorrect,
      currentQuestion
    });
    const totalTimeSpentMs = Date.now() - questionStartTime.current;
    const factId = currentQuestion.PK;

    // Update mastery progress
    const currentProgress = factProgress[factId] || 0;
    const newCorrectAnswers = currentProgress + (isCorrect ? 1 : 0);
    
    setFactProgress(prev => ({
      ...prev,
      [factId]: newCorrectAnswers
    }));
    
    // Create a local variable to track mastery status changes for this fact
    let shouldAddToMastered = false;
    let shouldRemoveFromMastered = false;
    
    // Update mastered facts set based on the fact's group
    if (isMastered(factId, newCorrectAnswers)) {
      shouldAddToMastered = true;
      setMasteredFacts(prev => {
        const newSet = new Set(prev).add(factId);
        return newSet;
      });
    } else if (masteredFacts.has(factId)) {
      shouldRemoveFromMastered = true;
      setMasteredFacts(prev => {
        const newSet = new Set(prev);
        newSet.delete(factId);
        return newSet;
      });
    }

    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
      
      // Update progress
      if (user?.userId) {
        try {
          // Update fact attempts for analytics
          const updatedAttempts = {
            attempts: (factAttempts[factId]?.attempts || 0) + 1,
            correct: (factAttempts[factId]?.correct || 0) + 1,
            timeSpent: (factAttempts[factId]?.timeSpent || 0) + totalTimeSpentMs
          };
          
          setFactAttempts(prev => ({
            ...prev,
            [factId]: updatedAttempts
          }));

          // For accuracy goal tracking - ONLY when:
          // 1. The answer is correct
          // 2. We've reached exactly the threshold number of attempts
          // 3. All attempts have been correct
          const isPracticeFact = practiceFacts.includes(factId);
          const threshold = isPracticeFact ? PRACTICE_MASTERY_THRESHOLD : OTHER_MASTERY_THRESHOLD;
          
          if (isPracticeFact && 
              updatedAttempts.attempts === updatedAttempts.correct && 
              updatedAttempts.attempts === PRACTICE_MASTERY_THRESHOLD) {
            
            // This fact has achieved 100% accuracy across all attempts
            // The backend now handles goal completion automatically based on progress updates.
            // console.log(`[AccuracyPractice] Fact ${factId} met accuracy criteria. Backend will handle goal update.`);
            
          }

          // Get current practice context from session storage
          const practiceContextData = sessionStorage.getItem('practiceContext');
          let practiceContext = '';
          if (practiceContextData) {
            try {
              const parsed = JSON.parse(practiceContextData);
              practiceContext = parsed.current || '';
            } catch (error) {
              console.error('Error parsing practiceContext for progress update:', error);
            }
          }

          // Send progress to API via queue
          progressQueue.enqueueProgressUpdate(
            user.userId,
            {
              facts: {
                [factId.split('FACT#')[1]]: {
                  attempts: 1,
                  correct: isCorrect ? 1 : 0,
                  timeSpent: totalTimeSpentMs,
                  practiceContext: practiceContext
                }
              }
            }
          );
        } catch (error) {
          // Log the error using our utility
          logError(error, {
            component: 'AccuracyPractice-ProgressUpdate',
            trackId,
            userId: user?.userId,
            factId,
            isCorrect,
            timeSpent: totalTimeSpentMs,
            networkConnected: navigator.onLine,
            connectionType: (navigator as any).connection?.effectiveType || 'unknown'
          });
          // Continue despite errors - don't block the UX
        }
      }
      
      // Now set showFeedback after lastAnswerCorrect has been set
      setShowFeedback(true);
      
      setTimeout(() => {
        setShowFeedback(false);
        moveToNextQuestion(shouldAddToMastered ? factId : null, shouldRemoveFromMastered ? factId : null);
        setKey(prev => prev + 1);
        
        // Reset transition state after a short delay
        // setTimeout(() => { // This will be handled by moveToNextQuestion
        // setIsTransitioning(false);
        // }, 50);
      }, 200);
    } else {
      // Update progress
      if (user?.userId) {
        try {
          // Update fact attempts for analytics
          setFactAttempts(prev => ({
            ...prev,
            [factId]: {
              attempts: (prev[factId]?.attempts || 0) + 1,
              correct: (prev[factId]?.correct || 0),
              timeSpent: (prev[factId]?.timeSpent || 0) + totalTimeSpentMs
            }
          }));

          // Get current practice context from session storage
          const practiceContextData = sessionStorage.getItem('practiceContext');
          let practiceContext = '';
          if (practiceContextData) {
            try {
              const parsed = JSON.parse(practiceContextData);
              practiceContext = parsed.current || '';
            } catch (error) {
              console.error('Error parsing practiceContext for progress update:', error);
            }
          }

          // Send progress to API via queue
          progressQueue.enqueueProgressUpdate(
            user.userId,
            {
              facts: {
                [factId.split('FACT#')[1]]: {
                  attempts: 1,
                  correct: 0,
                  timeSpent: totalTimeSpentMs,
                  practiceContext: practiceContext
                }
              }
            }
          );
        } catch (error) {
          // Log the error using our utility
          logError(error, {
            component: 'AccuracyPractice-ProgressUpdate',
            trackId,
            userId: user?.userId,
            factId,
            isCorrect,
            timeSpent: totalTimeSpentMs,
            networkConnected: navigator.onLine,
            connectionType: (navigator as any).connection?.effectiveType || 'unknown'
          });
          // Continue despite errors - don't block the UX
        }
      }
      
      // Show feedback for incorrect answers first
      // Now set showFeedback after lastAnswerCorrect has been set
      setShowFeedback(true);
      
      // Then show correct answer input after a short delay
      setTimeout(() => {
        setShowFeedback(false);
        setShowCorrectAnswerInput(true);
      }, 200);
    }
  };

  const handleCorrectInput = () => {
    setShowCorrectAnswerInput(false);
    setQuestionsAnswered(prev => prev + 1);
    // setIsTransitioning(true); // This will be handled by moveToNextQuestion
    
    setTimeout(() => {
      moveToNextQuestion(null, null);
      setKey(prev => prev + 1);
      
      // Reset transition state after a short delay
      // setTimeout(() => { // This will be handled by moveToNextQuestion
      // setIsTransitioning(false);
      // }, 50);
    }, 100);
  };

  const moveToNextQuestion = (addToMastered: string | null = null, removeFromMastered: string | null = null) => {
    if (isTransitioning) {
      console.warn('[AccuracyPractice] moveToNextQuestion skipped due to isTransitioning');
      return;
    }
    setIsTransitioning(true);
    
    setQuestionsAnswered(prev => prev + 1);
    
    // Create a temporary masteredFacts set to use for this function
    const tempMasteredFacts = new Set(masteredFacts);
    
    // Apply any pending changes
    if (addToMastered) tempMasteredFacts.add(addToMastered);
    if (removeFromMastered) tempMasteredFacts.delete(removeFromMastered);
    
    // Get the current fact ID to update recently shown facts
    const currentFactId = facts[currentIndex]?.PK;
    
    // Update recently shown facts using the ref for immediate access
    if (currentFactId) {
      const updated = [...recentlyShownFactsRef.current];
      // Remove current fact if it's already in the list
      const existingIndex = updated.indexOf(currentFactId);
      if (existingIndex !== -1) {
        updated.splice(existingIndex, 1);
      }
      // Add current fact to the front of the array
      updated.unshift(currentFactId);
      // Keep only the 3 most recent facts
      recentlyShownFactsRef.current = updated.slice(0, 3);
    }
    
    // Prioritize non-mastered facts that haven't reached the attempt limit
    const nonMasteredFactIndices = facts
      .map((fact, index) => ({ fact, index }))
      .filter(item => {
        const factId = item.fact.PK;
        const attempts = factAttempts[factId]?.attempts || 0;
        return !tempMasteredFacts.has(factId) && attempts < MAX_ATTEMPTS_PER_FACT;
      })
      .map(item => item.index);
    
    if (nonMasteredFactIndices.length > 0) {
      // Filter out recently shown facts from the selection pool
      // Use the ref value for immediate access to the updated list
      let availableIndices = nonMasteredFactIndices.filter(
        index => !recentlyShownFactsRef.current.includes(facts[index].PK)
      );
      
      // If filtering out recent facts leaves us with no options, fall back to all non-mastered facts
      if (availableIndices.length === 0) {
        availableIndices = nonMasteredFactIndices;
      }
      
      // Choose a random fact from the available indices
      const randomIndex = availableIndices[
        Math.floor(Math.random() * availableIndices.length)
      ];
      
      // Ensure we're not selecting the current fact again if there are other options
      if (randomIndex === currentIndex && availableIndices.length > 1) {
        // Remove the current index from available indices
        availableIndices = availableIndices.filter(index => index !== currentIndex);
        // Select from the remaining indices
        const newRandomIndex = availableIndices[
          Math.floor(Math.random() * availableIndices.length)
        ];
        setCurrentIndex(newRandomIndex);
      } else {
        setCurrentIndex(randomIndex);
      }
    } else {
      // If all facts are mastered or have reached attempt limit, end the practice
      handlePracticeEnd();
    }
    
    // Reset transition state after a short delay to allow UI updates
    setTimeout(() => {
      setIsTransitioning(false);
    }, 50);
  };

  // Conditional returns
  if (!facts || facts.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div>No questions available</div>
      </div>
    );
  }

  const currentQuestion = facts[currentIndex];
  if (!currentQuestion) {
    return null;
  }

  if (isProcessingEnd) {
    return (
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center"
        >
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg text-gray-600">Processing final results...</p>
        </motion.div>
      </AnimatePresence>
    );
  }

  const renderInputMethod = () => {
    if (showCorrectAnswerInput) {
      return (
        <CorrectAnswerInput
          correctAnswer={currentQuestion.result}
          onCorrectInput={handleCorrectInput}
          question={{
            num1: currentQuestion.operand1,
            num2: currentQuestion.operand2,
            operator: currentQuestion.operation === 'addition' ? '+' : 
                     currentQuestion.operation === 'subtraction' ? '-' : 
                     currentQuestion.operation === 'multiplication' ? '×' : '÷'
          }}
        />
      );
    }

    // Create a compatible question object from the Fact
    const questionForInput = {
      num1: currentQuestion.operand1,
      num2: currentQuestion.operand2,
      operator: currentQuestion.operation === 'addition' ? '+' : 
                currentQuestion.operation === 'subtraction' ? '-' : 
                currentQuestion.operation === 'multiplication' ? '×' : '÷',
      answer: currentQuestion.result
    };
    
    console.log('QuestionScreen renderInputMethod:', { 
      questionForInput,
      currentQuestion,
      showFeedback
    });

    // Use the new AccuracyTextInput component
    return (
      <AccuracyTextInput
        question={questionForInput}
        onAnswer={handleAnswer}
        showFeedback={showFeedback}
        isCorrect={lastAnswerCorrect}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6 flex flex-col justify-center">
      <div className="max-w-4xl w-full mx-auto space-y-6">
        {/* Progress Bar - directly in the container, not in a card */}
        <ProgressBar current={currentMasteryProgress} total={totalRepetitionsNeeded} />
        
        {/* Question Card */}
        <div className="rounded-lg shadow-md p-6 border-2 bg-white border-gray-200">
          <div key={key}>
            {renderInputMethod()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestionScreen; 