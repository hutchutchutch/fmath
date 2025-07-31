import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import CorrectAnswerInput from '../ui/CorrectAnswer';
import Timer from '../ui/Timer';
import { useAuth } from '../../context/AuthContext';
import { setUserProgress } from '../../config/api';
import { SetUserProgressRequest } from '../../types/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ProgressBar from './ProgressBar';
import { Fact } from '../../types';
import FluencyTextInput from './FluencyTextInput';
import { logError } from '../../utils/errorReporting';
import { progressQueue } from '../../services/ProgressQueueService';

// Fact mastery utilities
const PRACTICE_MASTERY_THRESHOLD = 3;
const OTHER_MASTERY_THRESHOLD = 1;
const MAX_ATTEMPTS_PER_FACT = 5;
// Define timer duration constants for fluency practice
// const TIMER_GREEN_ZONE_DURATION = 4; // seconds for green zone

interface QuestionScreenProps {
  questions: Fact[];
  practiceFacts: string[]; // Array of PK values for practice facts
  otherFacts: string[]; // Array of PK values for other facts
  onComplete: () => void;
  timerDuration?: number; // Duration of green zone in seconds
}

const QuestionScreen: React.FC<QuestionScreenProps> = ({ 
  questions: facts, 
  practiceFacts,
  otherFacts,
  onComplete,
  timerDuration = 6 // Default to 6 seconds if not provided
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
  // Add timer-related state
  const [currentTimerZone, setCurrentTimerZone] = useState<'green' | 'yellow'>('green');
  const [isTimerActive, setIsTimerActive] = useState(true);
  const [timerKey, setTimerKey] = useState(0);
  const [factAttempts, setFactAttempts] = useState<Record<string, {
    attempts: number;
    correct: number;
    greenZoneCorrect: number; // Track correct answers in green zone
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
    
    // Return the total progress without limiting to 0
    return totalProgress;
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

  // Timer event handlers
  const handleTimerZoneChange = (zone: 'green' | 'yellow') => {
    setCurrentTimerZone(zone);
  };

  const handleTimerTimeout = () => {
    // When timer runs out completely, treat it as an incorrect answer
    // and show the correct answer input
    setIsTimerActive(false);
    
    // Update fact progress as incorrect
    const currentQuestion = facts[currentIndex];
    if (currentQuestion) {
      const factId = currentQuestion.PK;
      const currentProgress = factProgress[factId] || 0;
      const newCorrectAnswers = currentProgress; // No penalty, just don't add progress
      
      setFactProgress(prev => ({
        ...prev,
        [factId]: newCorrectAnswers
      }));
      
      // Check if mastery status changed
      const wasMastered = masteredFacts.has(factId);
      const nowMastered = isMastered(factId, newCorrectAnswers);
      
      // Update mastered facts if status changed
      if (wasMastered && !nowMastered) {
        setMasteredFacts(prev => {
          const newSet = new Set(Array.from(prev));
          newSet.delete(factId);
          return newSet;
        });
      }
      
      // Update fact attempts
      setFactAttempts(prev => {
        const newAttempts = {
          ...prev,
          [factId]: {
            attempts: (prev[factId]?.attempts || 0) + 1,
            correct: prev[factId]?.correct || 0,
            greenZoneCorrect: prev[factId]?.greenZoneCorrect || 0, // No increment as answer is incorrect
            timeSpent: (prev[factId]?.timeSpent || 0) + 12000 // Assume max time
          }
        };
        
        return newAttempts;
      });
      
      // Show the correct answer input instead of moving to next question
      setShowCorrectAnswerInput(true);
    }
  };

  // Reset timer for new question
  const resetTimer = useCallback(() => {
    setTimerKey(prev => prev + 1);
    setCurrentTimerZone('green');
    // Don't set isTimerActive here, as it's controlled by the parent logic
  }, []);

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
      greenZoneCorrect: number;
      timeSpent: number;
    }> = {};
    
    const initialProgress: Record<string, number> = {};
    
    questions.forEach(question => {
      const factId = question.id;
      initialFactAttempts[factId] = {
        attempts: 0,
        correct: 0,
        greenZoneCorrect: 0,
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
    questionStartTime.current = Date.now();
    
    // Reset the timer when moving to a new question
    resetTimer();
    
    // Reset transition state
    setIsTransitioning(false);
    
    // Set a timer to show the answer after 12 seconds
    if (!showCorrectAnswerInput) {
      showAnswerTimer.current = setTimeout(() => {
        if (isMounted.current) {
          setShowCorrectAnswerInput(true);
        }
      }, 12000);
      
      return () => {
        if (showAnswerTimer.current) {
          clearTimeout(showAnswerTimer.current);
          showAnswerTimer.current = null;
        }
      };
    }
  }, [currentIndex, showCorrectAnswerInput, resetTimer]);

  // Add a debugging useEffect
  useEffect(() => {
    console.log('QuestionScreen state update:', { 
      showFeedback, 
      lastAnswerCorrect,
      currentIndex
    });
  }, [showFeedback, lastAnswerCorrect, currentIndex]);

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
        component: 'FluencyPractice-QuestionScreen',
        trackId,
        userId: user?.userId,
        pendingUpdates: progressUpdatePromises.current.length
      });
      
      // Allow user to continue despite the error
      setIsProcessingEnd(false);
      onComplete();
      
      // Show a less blocking message
      console.log('Progress updates may not have been saved. Continuing...');
    }
  };

  // Update the handleAnswer function to consider timer state
  const handleAnswer = async (answer: number) => {
    if (!facts[currentIndex] || isTransitioning) {
      console.warn('No current question found or transition in progress');
      return;
    }

    // Pause the timer when an answer is submitted
    setIsTimerActive(false);

    // Clear the show answer timer
    if (showAnswerTimer.current) {
      clearTimeout(showAnswerTimer.current);
      showAnswerTimer.current = null;
    }

    const currentQuestion = facts[currentIndex];
    const isCorrect = answer === currentQuestion.result;
    
    // Determine if the answer is truly correct based on timer zone
    // In yellow zone, we count it as incorrect for mastery purposes
    const isTrulyCorrect = isCorrect && currentTimerZone === 'green';
    
    // Set lastAnswerCorrect based on the actual correctness of the answer
    // This affects the visual feedback
    setLastAnswerCorrect(isCorrect);
    
    console.log('QuestionScreen handleAnswer:', { 
      userAnswer: answer, 
      correctAnswer: currentQuestion.result, 
      isCorrect,
      isTrulyCorrect,
      currentQuestion,
      timerZone: currentTimerZone
    });
    const totalTimeSpentMs = Date.now() - questionStartTime.current;
    const factId = currentQuestion.PK;

    // Update mastery progress - consider timer zone for fluency practice
    const currentProgress = factProgress[factId] || 0;
    
    // Adjust scoring based on timer zone
    let newCorrectAnswers: number;
    if (isTrulyCorrect) {
      // Only give credit for green zone correct answers
      newCorrectAnswers = currentProgress + 1;
    } else {
      // Yellow zone correct answers or incorrect answers don't add to progress
      newCorrectAnswers = currentProgress;
    }
    
    setFactProgress(prev => ({
      ...prev,
      [factId]: newCorrectAnswers
    }));
    
    // Create a local variable to track mastery status changes for this fact
    let shouldAddToMastered = false;
    let shouldRemoveFromMastered = false;
    
    // Check if this fact is now mastered or unmastered
    const wasMastered = masteredFacts.has(factId);
    const nowMastered = isMastered(factId, newCorrectAnswers);
    
    if (!wasMastered && nowMastered) {
      shouldAddToMastered = true;
    } else if (wasMastered && !nowMastered) {
      shouldRemoveFromMastered = true;
    }
    
    // Update fact attempts
    setFactAttempts(prev => {
      const newAttempts = {
        ...prev,
        [factId]: {
          attempts: (prev[factId]?.attempts || 0) + 1,
          correct: (prev[factId]?.correct || 0) + (isCorrect ? 1 : 0),
          greenZoneCorrect: (prev[factId]?.greenZoneCorrect || 0) + (isTrulyCorrect ? 1 : 0),
          timeSpent: (prev[factId]?.timeSpent || 0) + totalTimeSpentMs
        }
      };
      
      // Check if the fact meets the criteria for fluency practice goal
      // 1. It has been attempted at least 3 times
      // 2. All attempts were correct
      // 3. At least 3 attempts were submitted in the green zone
      // 4. It is a practice fact (not an other fact)
      const attempts = newAttempts[factId].attempts;
      const correct = newAttempts[factId].correct;
      const greenZoneCorrect = newAttempts[factId].greenZoneCorrect;
      const isPracticeFact = practiceFacts.includes(factId);
      
      if (attempts >= 3 && correct === attempts && greenZoneCorrect >= 3 && isPracticeFact) {
        // Only count it towards the fluency goal if it's a practice fact and all answers were correct
        // The backend now handles goal completion automatically based on progress updates.
        // console.log(`[FluencyPractice] Fact ${factId} met fluency criteria. Backend will handle goal update.`);
      }
      
      return newAttempts;
    });
    
    // Show feedback briefly
    setShowFeedback(true);
    
    // If the answer is incorrect and we're in green zone, show the correct answer input
    if (!isCorrect) {
      // For incorrect answers regardless of timer zone, switch to CorrectAnswerInput
      setTimeout(() => {
        setShowFeedback(false);
        setShowCorrectAnswerInput(true);
      }, 200);
    } else {
      // For correct answers, move to the next question after a brief feedback display
      setTimeout(() => {
        setShowFeedback(false);
        moveToNextQuestion(
          shouldAddToMastered ? factId : null,
          shouldRemoveFromMastered ? factId : null
        );
      }, 200);
    }

    // Update progress
    if (user?.userId) {
      try {
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
          component: 'FluencyPractice-ProgressUpdate',
          trackId,
          userId: user.userId,
          factId,
          isCorrect,
          timeSpent: totalTimeSpentMs,
          networkConnected: navigator.onLine,
          connectionType: (navigator as any).connection?.effectiveType || 'unknown'
        });
      }
    }
  };

  const handleCorrectInput = () => {
    setShowCorrectAnswerInput(false);
    setQuestionsAnswered(prev => prev + 1);
    
    // Move to the next question and reset the timer
    moveToNextQuestion();
  };

  const moveToNextQuestion = (addToMastered: string | null = null, removeFromMastered: string | null = null) => {
    // Don't allow transitions while one is in progress
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    
    // Update mastered facts set if needed
    if (addToMastered) {
      setMasteredFacts(prev => new Set([...Array.from(prev), addToMastered]));
    }
    if (removeFromMastered) {
      setMasteredFacts(prev => {
        const newSet = new Set(Array.from(prev));
        newSet.delete(removeFromMastered);
        return newSet;
      });
    }
    
    // Reset feedback state
    setShowFeedback(false);
    
    // Create a temporary masteredFacts set to use for this function
    const tempMasteredFacts = new Set(masteredFacts);
    if (addToMastered) tempMasteredFacts.add(addToMastered);
    if (removeFromMastered) tempMasteredFacts.delete(removeFromMastered);
    
    // If all facts are mastered, end the practice
    const allMastered = facts.every(fact => tempMasteredFacts.has(fact.PK));
    if (allMastered) {
        handlePracticeEnd();
        return;
    }
    
    setShowCorrectAnswerInput(false);
    
    // Reset timer for the next question
    resetTimer();
    // Ensure timer is active for the next question
    setIsTimerActive(true);
    
    // Increment current index to move to next question
    setCurrentIndex(prevIndex => {
      // Get the current fact ID to update recently shown facts
      const currentFactId = facts[prevIndex]?.PK;
      
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
        if (randomIndex === prevIndex && availableIndices.length > 1) {
          // Remove the current index from available indices
          availableIndices = availableIndices.filter(index => index !== prevIndex);
          // Select from the remaining indices
          const newRandomIndex = availableIndices[
            Math.floor(Math.random() * availableIndices.length)
          ];
          return newRandomIndex;
        } else {
          return randomIndex;
        }
      } else {
        // If all facts are mastered or have reached attempt limit, end the practice
        handlePracticeEnd();
        return prevIndex;
      }
    });

    // Reset isTransitioning state after a short delay
    setTimeout(() => {
      setIsTransitioning(false);
    }, 100);
  };

  // Add a useEffect to reset the component state when timerDuration changes
  useEffect(() => {
    // Reset component state for the new timer duration
    setCurrentIndex(0);
    setQuestionsAnswered(0);
    setCorrectAnswers(0);
    setShowFeedback(false);
    setIsProcessingEnd(false);
    setShowCorrectAnswerInput(false);
    setIsTransitioning(false);
    setKey(prev => prev + 1);
    setCurrentTimerZone('green');
    // Pause the timer initially until the notice is closed
    setIsTimerActive(false);
    setTimerKey(prev => prev + 1);
    setFactAttempts({});
    setFactProgress({});
    setMasteredFacts(new Set());
    recentlyShownFactsRef.current = [];
    
    // Reset the timer (but don't start it yet)
    resetTimer();
    
    // Display a message about the new timer duration
    const timerMessage = document.createElement('div');
    timerMessage.className = 'fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50';
    timerMessage.innerHTML = `
      <div class="bg-white p-8 rounded-lg shadow-lg text-center max-w-md">
        <h2 class="text-2xl font-bold mb-4">New Timer Speed: ${timerDuration}s</h2>
        <p class="mb-6">Get ready for the next level!</p>
        <div class="w-full bg-gray-200 h-2 rounded-full">
          <div class="bg-blue-600 h-2 rounded-full animate-shrink"></div>
        </div>
      </div>
    `;
    
    document.body.appendChild(timerMessage);
    
    // Remove the message after 3 seconds and start the timer
    setTimeout(() => {
      document.body.removeChild(timerMessage);
      // Start the timer after the notice is closed
      setIsTimerActive(true);
      // Reset the question start time to NOW to avoid counting the overlay time
      questionStartTime.current = Date.now();
    }, 3000);
    
  }, [timerDuration, resetTimer]);

  // Add a style for the animation
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes shrink {
        from { width: 100%; }
        to { width: 0%; }
      }
      .animate-shrink {
        animation: shrink 3s linear forwards;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Calculate total attempts for Start Over button
  const totalAttempts = useMemo(() => {
    return Object.values(factAttempts).reduce((sum, fact) => sum + (fact.attempts || 0), 0);
  }, [factAttempts]);
  const ATTEMPT_THRESHOLD = 40;

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
    
    // Use the new FluencyTextInput component
    return (
      <FluencyTextInput
        question={questionForInput}
        onAnswer={handleAnswer}
        showFeedback={showFeedback}
        isCorrect={lastAnswerCorrect}
        timerKey={timerKey}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6 flex flex-col justify-center">
      <div className="max-w-4xl w-full mx-auto space-y-6">
        {/* Progress Bar - directly in the container, not in a card */}
        <ProgressBar current={currentMasteryProgress} total={totalRepetitionsNeeded} />
        
        {/* Main content card */}
        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 relative">
          {/* Timer component */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-500">
                Timer Speed: {timerDuration}s
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                timerDuration >= 6 ? 'bg-green-100 text-green-800' : 
                timerDuration >= 3 ? 'bg-blue-100 text-blue-800' : 
                timerDuration >= 2 ? 'bg-yellow-100 text-yellow-800' : 
                'bg-red-100 text-red-800'
              }`}>
                {timerDuration >= 6 ? 'Beginner' : 
                 timerDuration >= 3 ? 'Intermediate' : 
                 timerDuration >= 2 ? 'Advanced' : 
                 'Expert'}
              </span>
            </div>
            <Timer
              key={timerKey}
              duration={timerDuration}
              onTimeout={handleTimerTimeout}
              onZoneChange={handleTimerZoneChange}
              isActive={isTimerActive && !showFeedback && !showCorrectAnswerInput}
            />
          </div>
          
          {/* Question display */}
          {currentQuestion && (
            <div className="rounded-lg shadow-md p-6 border-2 bg-white border-gray-200">
              <div key={key}>
                {renderInputMethod()}
              </div>
            </div>
          )}
        </div>
        {/* Start Over button after threshold */}
        {totalAttempts > ATTEMPT_THRESHOLD && (
          <div className="flex justify-center mt-6">
            <button
              className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold shadow-md transition-all duration-200"
              onClick={() => { window.location.href = '/fluency-practice'; }}
            >
              Start Over
            </button>
          </div>
        )}
      </div>
      
      {/* Processing overlay */}
      {isProcessingEnd && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg text-gray-600">Processing final results...</p>
        </div>
      )}
    </div>
  );
};

export default QuestionScreen; 