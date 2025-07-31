import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Fact } from './types';
import { useAuth } from '../../context/AuthContext';
import { setUserProgress } from '../../config/api';
import { SetUserProgressRequest } from '../../types/progress';
import { motion } from 'framer-motion';
import { FiZap } from 'react-icons/fi';
import { cn } from '../../lib/utils';
import Timer from '../ui/Timer';
import { TouchpadInput } from '../ui/TouchpadInput';
import { BackButton } from '../ui/BackButton';

// Utility functions
const renderOperationSymbol = (operation: Fact['operation']) => {
  switch (operation) {
    case 'addition': return '+';
    case 'subtraction': return '−';
    case 'multiplication': return '×';
    case 'division': return '÷';
  }
};

const isCommutativeOperation = (operation: Fact['operation']) => {
  return operation === 'addition' || operation === 'multiplication';
};

const getFactId = (fact: Fact, isInverted = false) => {
  const { operand1, operand2, operation } = fact;
  return isInverted ? 
    `${operand2}-${operand1}-${operation}` :
    `${operand1}-${operand2}-${operation}`;
};

const getTrackingFactId = (fact: Fact) => {
  const baseFactId = fact.PK.split('FACT#')[1];
  const isInverted = fact.operand1 > fact.operand2;
  return isInverted ? `${baseFactId}i` : baseFactId;
};

// Fact mastery utilities
const MASTERY_THRESHOLD = 3;
const INCORRECT_PENALTY = -2;
const MIN_CORRECT_ANSWERS = -4;
const MAX_CORRECT_ANSWERS = 3;

const isMastered = (correctAnswers: number) => correctAnswers >= MASTERY_THRESHOLD;

const getNewCorrectAnswers = (currentCorrectAnswers: number, isCorrect: boolean) => {
  const newValue = currentCorrectAnswers + (isCorrect ? 1 : INCORRECT_PENALTY);
  return Math.min(Math.max(newValue, MIN_CORRECT_ANSWERS), MAX_CORRECT_ANSWERS);
};

const getTimerDuration = (correctAnswers: number) => {
  // Use fixed time thresholds
  if (correctAnswers <= 0) return 6;
  if (correctAnswers === 1) return 4.5;
  if (correctAnswers >= 2) return 3;
  return 6; // Fallback
};

const getCardColor = (correctAnswers: number) => {
  if (correctAnswers >= MASTERY_THRESHOLD) return 'bg-green-100 border-green-500';
  if (correctAnswers === 2) return 'bg-green-50 border-green-300';
  if (correctAnswers === 1) return 'bg-yellow-100 border-yellow-500';
  if (correctAnswers === 0) return 'bg-white border-gray-200';
  return 'bg-red-100 border-red-400'; // for negative values
};

interface PermutatedFact extends Fact {
  id: string;
  correctAnswers: number;
}

// Generate all permutations of facts with initial correctAnswers
const generatePermutations = (facts: Fact[]): PermutatedFact[] => {
  return facts.flatMap(fact => {
    const permutations: PermutatedFact[] = [];
    
    if (isCommutativeOperation(fact.operation)) {
      // Commutative operations: a + b and b + a
      permutations.push(
        {
          ...fact,
          id: getFactId(fact),
          correctAnswers: 0
        },
        {
          ...fact,
          operand1: fact.operand2,
          operand2: fact.operand1,
          id: getFactId(fact, true),
          correctAnswers: 0
        }
      );
    } else {
      // Non-commutative operations: only original form
      permutations.push({
        ...fact,
        id: getFactId(fact),
        correctAnswers: 0
      });
    }
    
    return permutations;
  });
};

const FactMasteryCard: React.FC<{
  fact: PermutatedFact;
}> = ({ fact }) => {
  return (
    <div 
      className={cn(
        "w-20 h-12 rounded-lg border-2 flex items-center justify-center transition-colors duration-300",
        getCardColor(fact.correctAnswers)
      )}
    >
      <span className="text-sm font-medium">
        {fact.operand1} {renderOperationSymbol(fact.operation)} {fact.operand2}
      </span>
    </div>
  );
};

export function TimedPracticePage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const originalFacts: Fact[] = location.state?.facts || [];
  const inputRef = useRef<HTMLInputElement>(null);
  const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';
  
  // States
  const [userAnswer, setUserAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<PermutatedFact | null>(null);
  const [remainingQuestions, setRemainingQuestions] = useState<PermutatedFact[]>([]);
  const [masteredQuestions, setMasteredQuestions] = useState<Set<string>>(new Set());
  const [showingCorrectAnswer, setShowingCorrectAnswer] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [factAttempts, setFactAttempts] = useState<Record<string, {
    attempts: number;
    correct: number;
    timeSpent: number;
  }>>({});
  const [factProgress, setFactProgress] = useState<Record<string, number>>({});
  const [key, setKey] = useState(0);
  const isSubmitting = useRef<boolean>(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isInitialized, setIsInitialized] = useState(true); // Set to true by default since we don't need to fetch target time
  const [currentTimerZone, setCurrentTimerZone] = useState<'green' | 'yellow'>('green');

  // Initialize practice session
  useEffect(() => {
    const allPermutations = generatePermutations(originalFacts);
    const randomIndex = Math.floor(Math.random() * allPermutations.length);
    const firstQuestion = allPermutations[randomIndex];
    const initialRemaining = allPermutations.filter((_, index) => index !== randomIndex);
    
    setCurrentQuestion(firstQuestion);
    setRemainingQuestions(initialRemaining);
    setIsInitialized(true);
  }, []);

  // Focus input on mount and question change
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentQuestion]);

  // Helper function to check if both forms of a fact are ready for status update
  const checkBothFactFormsReady = (fact: PermutatedFact, progress: Record<string, number>): boolean => {
    // Get IDs for both original and inverted forms
    const originalId = getFactId(fact, false);
    const invertedId = getFactId({
      ...fact,
      operand1: fact.operand2,
      operand2: fact.operand1
    }, true);
    
    // Check if both have reached correctAnswers >= MASTERY_THRESHOLD
    const originalCorrectAnswers = progress[originalId] || 0;
    const invertedCorrectAnswers = progress[invertedId] || 0;
    
    return originalCorrectAnswers >= MASTERY_THRESHOLD && invertedCorrectAnswers >= MASTERY_THRESHOLD;
  };

  // Add progress update when answering questions
  const updateProgressForAnswer = async (factId: string, isCorrect: boolean, timeSpent: number) => {
    if (!user?.userId || !currentQuestion) return;

    // Calculate new correctAnswers value
    const currentCorrectAnswers = factProgress[currentQuestion.id] || 0;
    const newCorrectAnswers = getNewCorrectAnswers(currentCorrectAnswers, isCorrect);
    
    // Update local state for UI purposes only
    // Use a callback to ensure we have the latest state for our API call
    setFactProgress(prev => {
      const updatedProgress = {
        ...prev,
        [currentQuestion.id]: newCorrectAnswers
      };
      
      // Only update backend when correctAnswers EXACTLY reaches MASTERY_THRESHOLD
      // This ensures we only update once when the threshold is first reached
      if (newCorrectAnswers === MASTERY_THRESHOLD && currentCorrectAnswers < MASTERY_THRESHOLD) {
        // For commutative operations, check if both original and inverted forms have reached MASTERY_THRESHOLD
        const baseFactId = factId; // Use the factId passed to this function
        const shouldUpdateStatus = isCommutativeOperation(currentQuestion.operation) 
          ? checkBothFactFormsReady(currentQuestion, updatedProgress) 
          : true; // For non-commutative operations, we can update immediately
        
        if (shouldUpdateStatus) {
          // The backend will now handle goal completion when status changes.
          
          // Use setTimeout to ensure this runs after the state update is committed
          setTimeout(async () => {
            try {
              const progressUpdate: SetUserProgressRequest = {
                facts: {
                  [baseFactId]: {
                    status: 'accuracyPractice'
                  }
                }
              };
              
              await setUserProgress(user.userId, progressUpdate);
            } catch (error) {
              console.error('Failed to update fact status to accuracyPractice:', error);
            }
          }, 0);
        }
      }
      
      return updatedProgress;
    });
  };

  const checkAnswer = () => {
    if (!currentQuestion || !userAnswer || isNaN(parseInt(userAnswer, 10))) {
      setIsCorrect(false);
      return;
    }

    const numericAnswer = parseInt(userAnswer, 10);
    const correct = numericAnswer === currentQuestion.result;
    setIsCorrect(correct);
    
    const timeSpent = Date.now() - startTime;
    
    // Only call updateFactAttempts which will handle all state updates and API calls
    // Pass the additional condition for green zone
    updateFactAttempts(correct, timeSpent, currentTimerZone === 'green');

    if (correct) {
      // Get the updated correctAnswers value from factProgress after updateFactAttempts has updated it
      setTimeout(() => {
        const updatedCorrectAnswers = factProgress[currentQuestion.id] || 0;
        
        // Update the currentQuestion for UI purposes
        setCurrentQuestion(prev => ({
          ...prev!,
          correctAnswers: updatedCorrectAnswers
        }));

        if (isMastered(updatedCorrectAnswers)) {
          setMasteredQuestions(prev => new Set(prev).add(currentQuestion.id));
        }
      }, 0);

      setIsTransitioning(true);
      setTimeout(() => {
        const nextQuestion = getNextQuestion();
        
        // Reset states
        setUserAnswer('');
        setIsCorrect(null);
        setShowingCorrectAnswer(false);
        setTimerExpired(false);
        setStartTime(Date.now());
        setKey(prev => prev + 1);
        setIsTransitioning(false);
        setCurrentTimerZone('green'); // Reset timer zone for next question

        // Set next question or complete practice
        if (nextQuestion) {
          setCurrentQuestion(nextQuestion);
        } else if (remainingQuestions.length === 0) {
          handlePracticeComplete();
        }
      }, 300);
    } else {
      // For incorrect answers, update the currentQuestion with the updated correctAnswers value
      setTimeout(() => {
        const updatedCorrectAnswers = factProgress[currentQuestion.id] || 0;
        
        setCurrentQuestion(prev => ({
          ...prev!,
          correctAnswers: updatedCorrectAnswers
        }));

        // Remove from mastered if it was mastered but is no longer
        if (!isMastered(updatedCorrectAnswers) && masteredQuestions.has(currentQuestion.id)) {
          setMasteredQuestions(prev => {
            const newSet = new Set(prev);
            newSet.delete(currentQuestion.id);
            return newSet;
          });
        }
      }, 0);

      setShowingCorrectAnswer(true);
      // Add back to remaining questions
      setRemainingQuestions(prev => [...prev, currentQuestion]);
    }
  };

  const handlePracticeComplete = () => {
    // Check if all facts have reached mastery based on local factProgress state
    const allFactsMastered = generatePermutations(originalFacts).every(fact => 
      (factProgress[fact.id] || 0) >= MASTERY_THRESHOLD
    );

    if (!allFactsMastered) {
      // If not all facts are mastered, reset remaining questions with non-mastered facts
      const nonMasteredFacts = generatePermutations(originalFacts).filter(fact => 
        (factProgress[fact.id] || 0) < MASTERY_THRESHOLD
      );
      setRemainingQuestions(nonMasteredFacts);
      const randomIndex = Math.floor(Math.random() * nonMasteredFacts.length);
      const nextQuestion = {
        ...nonMasteredFacts[randomIndex],
        correctAnswers: factProgress[nonMasteredFacts[randomIndex].id] || 0
      };
      setCurrentQuestion(nextQuestion);
      setUserAnswer('');
      setIsCorrect(null);
      setShowingCorrectAnswer(false);
      setTimerExpired(false);
      setStartTime(Date.now());
      setKey(prev => prev + 1);
      return;
    }

    // Only navigate when all facts are mastered - pass the original facts
    navigate('/accuracy-practice', {
      state: {
        facts: originalFacts
      }
    });
  };

  // Add this effect to initialize fact attempts tracking
  useEffect(() => {
    const initialFactAttempts: Record<string, { attempts: number; correct: number; timeSpent: number }> = {};
    const initialProgress: Record<string, number> = {};
    const allPermutations = generatePermutations(originalFacts);
    
    allPermutations.forEach((fact: PermutatedFact) => {
      const trackingFactId = getTrackingFactId(fact);
      initialFactAttempts[trackingFactId] = {
        attempts: 0,
        correct: 0,
        timeSpent: 0
      };
      initialProgress[fact.id] = 0;
    });
    
    setFactAttempts(initialFactAttempts);
    setFactProgress(initialProgress);
  }, [originalFacts]);

  const updateFactAttempts = (correct: boolean, timeSpent: number, isGreenZone = true) => {
    if (!currentQuestion) return;

    // Get the base fact ID
    const baseFactId = currentQuestion.PK.split('FACT#')[1];
    
    // Update local factAttempts state for tracking purposes
    const trackingFactId = getTrackingFactId(currentQuestion);
    
    // Use a callback to ensure we have the latest state
    setFactAttempts(prev => {
      const updatedAttempts = {
        ...prev,
        [trackingFactId]: {
          attempts: (prev[trackingFactId]?.attempts || 0) + 1,
          correct: (prev[trackingFactId]?.correct || 0) + (correct ? 1 : 0),
          timeSpent: (prev[trackingFactId]?.timeSpent || 0) + timeSpent
        }
      };
      
      return updatedAttempts;
    });

    // Calculate new correctAnswers value - only increment if correct AND in green zone (if specified)
    const currentCorrectAnswers = factProgress[currentQuestion.id] || 0;
    const newCorrectAnswers = getNewCorrectAnswers(
      currentCorrectAnswers,
      correct && isGreenZone
    );
    
    // Update local state for UI purposes
    setFactProgress(prev => ({
      ...prev,
      [currentQuestion.id]: newCorrectAnswers
    }));

    // Call updateProgressForAnswer to handle the status update when needed
    // Use setTimeout to ensure state updates have been processed
    setTimeout(() => {
      updateProgressForAnswer(baseFactId, correct && isGreenZone, timeSpent);
    }, 0);
  };

  // Initialize or get next question
  const getNextQuestion = () => {
    if (remainingQuestions.length === 0) {
      return null;
    }
    const randomIndex = Math.floor(Math.random() * remainingQuestions.length);
    const question = remainingQuestions[randomIndex];
    setRemainingQuestions(prev => prev.filter((_, index) => index !== randomIndex));
    
    // Update the question with its current progress
    return {
      ...question,
      correctAnswers: factProgress[question.id] || 0
    };
  };

  const handleTryAgain = () => {
    setUserAnswer('');
    setIsCorrect(null);
    setShowingCorrectAnswer(false);
    setTimerExpired(false);
    setStartTime(Date.now());
    setKey(prev => prev + 1);
    // Focus the input after state updates
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  // Add global Enter key handler for Try Again
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isCorrect && showingCorrectAnswer) {
        handleTryAgain();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isCorrect, showingCorrectAnswer]);

  const handleInputChange = (newValue: string) => {
    if (isCorrect !== null || timerExpired) return;
    
    setUserAnswer(newValue);
    
    // Auto-submit when input length matches answer length
    if (newValue.length === currentQuestion?.result.toString().length) {
      const numValue = parseInt(newValue, 10);
      if (!isNaN(numValue) && isCorrect === null && !timerExpired) {
        const correct = numValue === currentQuestion.result;
        setIsCorrect(correct);
        
        const timeSpent = Date.now() - startTime;
        updateFactAttempts(correct, timeSpent, currentTimerZone === 'green');
    
        // Update fact progress - only increment if correct AND in green zone
        const newCorrectAnswers = getNewCorrectAnswers(
          factProgress[currentQuestion.id] || 0,
          correct && currentTimerZone === 'green'
        );
        setFactProgress(prev => ({
          ...prev,
          [currentQuestion.id]: newCorrectAnswers
        }));
    
        if (correct) {
          setCurrentQuestion(prev => ({
            ...prev!,
            correctAnswers: newCorrectAnswers
          }));
    
          if (isMastered(newCorrectAnswers)) {
            setMasteredQuestions(prev => new Set(prev).add(currentQuestion.id));
          }
    
          setIsTransitioning(true);
          setTimeout(() => {
            const nextQuestion = getNextQuestion();
            
            // Reset states
            setUserAnswer('');
            setIsCorrect(null);
            setShowingCorrectAnswer(false);
            setTimerExpired(false);
            setStartTime(Date.now());
            setKey(prev => prev + 1);
            setIsTransitioning(false);
            setCurrentTimerZone('green'); // Reset timer zone for next question
    
            // Set next question or complete practice
            if (nextQuestion) {
              setCurrentQuestion(nextQuestion);
            } else if (remainingQuestions.length === 0) {
              handlePracticeComplete();
            }
          }, 300);
        } else {
          setCurrentQuestion(prev => ({
            ...prev!,
            correctAnswers: newCorrectAnswers
          }));
    
          // Remove from mastered if it was mastered
          if (masteredQuestions.has(currentQuestion.id)) {
            setMasteredQuestions(prev => {
              const newSet = new Set(prev);
              newSet.delete(currentQuestion.id);
              return newSet;
            });
          }
    
          setShowingCorrectAnswer(true);
          // Add back to remaining questions
          setRemainingQuestions(prev => [...prev, currentQuestion]);
        }
      }
    }
  };

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
        <div className="text-center animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
      <BackButton onBack={() => navigate('/practice', { state: { facts: originalFacts } })} />
      <div className="max-w-6xl mx-auto space-y-8">
        {isInitialized && (
          <Timer
            duration={getTimerDuration(factProgress[currentQuestion?.id || ''] || 0)}
            key={key}
            onTimeout={() => {
              setTimerExpired(true);
              setIsCorrect(false);
              setShowingCorrectAnswer(true);
              if (currentQuestion) {
                updateProgressForAnswer(currentQuestion.id, false, Date.now() - startTime);
              }
            }}
            onZoneChange={(zone) => setCurrentTimerZone(zone)}
            isActive={isCorrect === null && !showingCorrectAnswer && !timerExpired}
          />
        )}

        <h1 className="text-4xl font-bold text-center mb-6 animate-fade-in flex items-center justify-center gap-4">
          <FiZap className="text-yellow-400" size={32} />
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
            Practice Time!
          </span>
        </h1>

        <div className="flex flex-wrap justify-center gap-3 mb-8 max-w-[640px] mx-auto">
          {generatePermutations(originalFacts).map((fact) => (
            <FactMasteryCard 
              key={fact.id} 
              fact={{
                ...fact,
                correctAnswers: factProgress[fact.id] || 0
              }}
            />
          ))}
        </div>
        
        <div className="flex gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 space-y-6 p-6 bg-white rounded-lg shadow-md"
          >
            <div className="text-center space-y-6">
              <div className="text-4xl font-bold text-gray-900 py-8">
                {currentQuestion.operand1} {renderOperationSymbol(currentQuestion.operation)} {currentQuestion.operand2} = 
                <input 
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  value={userAnswer}
                  onChange={(e) => handleInputChange(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }}
                  className="ml-4 w-32 text-center border-b-2 border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all"
                  disabled={isCorrect !== null || timerExpired}
                />
              </div>

              {!isCorrect && isCorrect !== null && (
                <div className="space-y-4">
                  <div className="text-xl font-bold text-red-500">
                    Incorrect!
                  </div>
                  {showingCorrectAnswer && (
                    <div className="text-lg font-medium text-gray-700 py-4">
                      The correct fact is: {currentQuestion.operand1} {renderOperationSymbol(currentQuestion.operation)} {currentQuestion.operand2} = {currentQuestion.result}
                    </div>
                  )}
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleTryAgain}
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300"
                  >
                    Try Again
                  </motion.button>
                </div>
              )}

              {isCorrect && (
                <>
                  <div className="text-xl font-bold text-green-500">
                    Correct!
                  </div>
                  <div className="h-1 w-full bg-gray-100 rounded overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 0.3, ease: "linear" }}
                      className="h-full bg-green-500"
                    />
                  </div>
                </>
              )}
            </div>
          </motion.div>

          {/* Touchpad Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-6 bg-white rounded-lg shadow-md"
          >
            <TouchpadInput
              value={userAnswer}
              onChange={handleInputChange}
              disabled={isCorrect !== null || timerExpired}
              showFeedback={isCorrect !== null}
              wasCorrect={isCorrect === true}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}