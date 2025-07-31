import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Fact } from './types';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import { FiZap } from 'react-icons/fi';
import { cn } from '../../lib/utils';
import { TouchpadInput } from '../../components/ui/TouchpadInput';
import { BackButton } from '../../components/ui/BackButton';

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
const MASTERY_THRESHOLD = 2;
const INCORRECT_PENALTY = -2;

const isMastered = (correctAnswers: number) => correctAnswers >= MASTERY_THRESHOLD;

const getNewCorrectAnswers = (currentCorrectAnswers: number, isCorrect: boolean) => 
  currentCorrectAnswers + (isCorrect ? 1 : INCORRECT_PENALTY);

const getCardColor = (correctAnswers: number) => {
  if (correctAnswers >= MASTERY_THRESHOLD) return 'bg-green-100 border-green-500';
  if (correctAnswers === 1) return 'bg-yellow-100 border-yellow-500';
  if (correctAnswers < 0) return 'bg-red-100 border-red-400';
  return 'bg-white border-gray-200';
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

// Custom hook for fact progress tracking
const useFactProgress = (originalFacts: Fact[], userId: string | undefined) => {
  const [factAttempts, setFactAttempts] = useState<Record<string, {
    attempts: number;
    correct: number;
    timeSpent: number;
  }>>({});
  const [factProgress, setFactProgress] = useState<Record<string, number>>({});
  const [masteredQuestions, setMasteredQuestions] = useState<Set<string>>(new Set());

  // Initialize fact attempts and progress
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

  const updateProgress = async (fact: PermutatedFact, isCorrect: boolean, timeSpent: number) => {
    if (!userId) {
      console.error('Missing user ID');
      return;
    }

    const trackingFactId = getTrackingFactId(fact);
    const currentAttempts = factAttempts[trackingFactId] || { attempts: 0, correct: 0, timeSpent: 0 };

    // Update fact attempts
    const updatedAttempts = {
      attempts: currentAttempts.attempts + 1,
      correct: currentAttempts.correct + (isCorrect ? 1 : 0),
      timeSpent: currentAttempts.timeSpent + timeSpent
    };

    setFactAttempts(prev => ({
      ...prev,
      [trackingFactId]: {
        attempts: updatedAttempts.attempts,
        correct: updatedAttempts.correct,
        timeSpent: updatedAttempts.timeSpent
      }
    }));

    // Update correct answers count using current progress from factProgress
    const currentProgress = factProgress[fact.id] || 0;
    const newCorrectAnswers = getNewCorrectAnswers(currentProgress, isCorrect);
    setFactProgress(prev => ({
      ...prev,
      [fact.id]: newCorrectAnswers
    }));

    // Update mastery status
    if (isMastered(newCorrectAnswers)) {
      setMasteredQuestions(prev => new Set(prev).add(fact.id));
    } else if (masteredQuestions.has(fact.id)) {
      setMasteredQuestions(prev => {
        const newSet = new Set(prev);
        newSet.delete(fact.id);
        return newSet;
      });
    }
  };

  return {
    factAttempts,
    factProgress,
    masteredQuestions,
    updateProgress
  };
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

export function PracticePage() {
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
  const [showingCorrectAnswer, setShowingCorrectAnswer] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());

  const {
    factProgress,
    masteredQuestions,
    updateProgress,
    factAttempts
  } = useFactProgress(originalFacts, user?.userId);

  // Add effect to auto-advance on correct answer
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isCorrect === true) {
      timeoutId = setTimeout(() => {
        handleNext();
      }, 500);
    }
    return () => clearTimeout(timeoutId);
  }, [isCorrect]);

  // Initialize or get next question
  const getNextQuestion = () => {
    if (remainingQuestions.length === 0) {
      // If all questions are answered, check if any aren't mastered and reset the queue
      const nonMasteredFacts = generatePermutations(originalFacts).filter(fact => 
        (factProgress[fact.id] || 0) < MASTERY_THRESHOLD
      );
      
      if (nonMasteredFacts.length === 0) {
        return null; // All questions are mastered
      }
      
      const randomIndex = Math.floor(Math.random() * nonMasteredFacts.length);
      const nextQuestion = nonMasteredFacts[randomIndex];
      setRemainingQuestions(nonMasteredFacts.filter((_, index) => index !== randomIndex));
      
      return nextQuestion;
    }
    
    const randomIndex = Math.floor(Math.random() * remainingQuestions.length);
    const question = remainingQuestions[randomIndex];
    setRemainingQuestions(prev => prev.filter((_, index) => index !== randomIndex));
    
    return question;
  };

  // Initialize practice session
  useEffect(() => {
    const allPermutations = generatePermutations(originalFacts);
    const randomIndex = Math.floor(Math.random() * allPermutations.length);
    const firstQuestion = allPermutations[randomIndex];
    const initialRemaining = allPermutations.filter((_, index) => index !== randomIndex);
    
    setCurrentQuestion(firstQuestion);
    setRemainingQuestions(initialRemaining);
  }, []);

  // Focus input on mount and question change
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentQuestion]);

  // Add helper function to get number of digits
  const getNumberOfDigits = (num: number): number => {
    return Math.abs(num).toString().length;
  };

  const handleInputChange = (newValue: string) => {
    setUserAnswer(newValue);
    
    // If we have entered the expected number of digits and have a current question, check the answer automatically
    if (currentQuestion && newValue.length === getNumberOfDigits(currentQuestion.result)) {
      if (!newValue || isNaN(parseInt(newValue, 10))) {
        setIsCorrect(false);
        return;
      }

      const numericAnswer = parseInt(newValue, 10);
      const correct = numericAnswer === currentQuestion.result;
      const timeSpent = Date.now() - startTime;

      setIsCorrect(correct);
      updateProgress(currentQuestion, correct, timeSpent);

      if (!correct) {
        setShowingCorrectAnswer(true);
      }
    }
  };

  const handleNext = () => {
    if (currentQuestion) {
      setUserAnswer('');
      setIsCorrect(null);
      setShowingCorrectAnswer(false);
      setStartTime(Date.now());

      // Add current question back to remaining if not mastered
      if (!masteredQuestions.has(currentQuestion.id)) {
        setRemainingQuestions(prev => [...prev, currentQuestion]);
      }

      const nextQuestion = getNextQuestion();
      if (nextQuestion) {
        setCurrentQuestion(nextQuestion);
      } else if (remainingQuestions.length === 0) {
        handlePracticeComplete();
      }
    }
  };

  const handlePracticeComplete = () => {
    navigate('/timedpractice', {
      state: {
        facts: originalFacts
      }
    });
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
      <BackButton onBack={() => navigate('/learn', { state: { facts: originalFacts } })} />
      <div className="max-w-6xl mx-auto space-y-8">
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
            className="flex-1 p-6 bg-white rounded-lg shadow-md flex items-center"
          >
            <div className="w-full text-center">
              <div className="text-4xl font-bold text-gray-900">
                {currentQuestion.operand1} {renderOperationSymbol(currentQuestion.operation)} {currentQuestion.operand2} = 
                <input 
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  value={userAnswer}
                  onChange={(e) => handleInputChange(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && (isCorrect === null ? handleInputChange(userAnswer) : handleNext())}
                  className="ml-4 w-32 text-center border-b-2 border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all"
                />
              </div>
              
              {isCorrect === null ? (
                <div className="h-12" /> /* Spacer div to maintain layout */
              ) : (
                <div className="mt-8 space-y-4">
                  <div className={`text-xl font-bold ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                    {isCorrect ? 'Correct!' : 'Incorrect!'}
                  </div>
                  {isCorrect && (
                    <div className="h-1 w-full bg-gray-100 rounded overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.5, ease: "linear" }}
                        className="h-full bg-green-500"
                      />
                    </div>
                  )}
                  {showingCorrectAnswer && (
                    <div className="text-lg font-medium text-gray-700 py-4">
                      The correct fact is: {currentQuestion.operand1} {renderOperationSymbol(currentQuestion.operation)} {currentQuestion.operand2} = {currentQuestion.result}
                    </div>
                  )}
                  {!isCorrect && (
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setUserAnswer('');
                        setIsCorrect(null);
                        setShowingCorrectAnswer(false);
                      }}
                      className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300"
                    >
                      Try Again
                    </motion.button>
                  )}
                </div>
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
              disabled={showingCorrectAnswer}
              showFeedback={isCorrect !== null}
              wasCorrect={isCorrect === true}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}