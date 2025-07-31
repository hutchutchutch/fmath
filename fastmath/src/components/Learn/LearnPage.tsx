import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Fact } from './types';
import { useAuth } from '../../context/AuthContext';
import { useSession } from '../../context/SessionContext';
import { motion } from 'framer-motion';
import { FiZap } from 'react-icons/fi';
import { TouchpadInput } from '../../components/ui/TouchpadInput';
import { BackButton } from '../../components/ui/BackButton';

export function LearnPage() {
  const { user } = useAuth();
  const { recordPageTransition } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  const facts: Fact[] = location.state?.facts || [];
  const [stage, setStage] = useState<'teach' | 'practice'>('teach');
  const inputRef = useRef<HTMLInputElement>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  // Record page transition with fact IDs when component mounts
  useEffect(() => {
    if (facts.length > 0) {
      // Extract fact IDs from the facts array
      const factIds = facts.map(fact => fact.factId);
      
      // Record page transition with fact IDs in the learning stage
      recordPageTransition('learn', {
        learning: factIds
      });
    } else {
      // If no facts, just record the page transition without fact IDs
      recordPageTransition('learn');
    }
  }, [facts, recordPageTransition]);

  // Add helper function to get number of digits
  const getNumberOfDigits = (num: number): number => {
    return Math.abs(num).toString().length;
  };

  useEffect(() => {
    if (stage === 'practice' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [stage]);

  const nextFact = () => {
    if (currentFactIndex < facts.length - 1) {
      setCurrentFactIndex(currentFactIndex + 1);
    }
  };

  const currentFact = facts[currentFactIndex];

  const renderOperationSymbol = (operation: Fact['operation']) => {
    switch (operation) {
      case 'addition': return '+';
      case 'subtraction': return '−';
      case 'multiplication': return '×';
      case 'division': return '÷';
    }
  };

  const checkAnswer = () => {
    if (!userAnswer || isNaN(parseInt(userAnswer, 10))) {
      setIsCorrect(false);
      return;
    }

    const numericAnswer = parseInt(userAnswer, 10);
    const correct = numericAnswer === currentFact.result;
    setIsCorrect(correct);
  };

  const moveToNextFact = () => {
    if (currentFactIndex < facts.length - 1) {
      setCurrentFactIndex(currentFactIndex + 1);
      setStage('teach');
      setUserAnswer('');
      setIsCorrect(null);
    } else {
      navigate('/practice', { state: { facts } });
    }
  };

  const showAgain = () => {
    setStage('teach');
    setUserAnswer('');
    setIsCorrect(null);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (stage === 'teach') {
          setStage('practice');
        } else if (isCorrect === null) {
          checkAnswer();
        } else if (isCorrect) {
          moveToNextFact();
        } else {
          setIsCorrect(null);
          setUserAnswer('');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [stage, isCorrect, checkAnswer, moveToNextFact]);

  const handleInputChange = (newValue: string) => {
    setUserAnswer(newValue);
    
    // If we have entered the expected number of digits, check the answer automatically
    if (newValue.length === getNumberOfDigits(currentFact.result)) {
      const numericAnswer = parseInt(newValue, 10);
      const correct = numericAnswer === currentFact.result;
      setIsCorrect(correct);

      if (correct) {
        // Auto-advance after showing the success animation
        setTimeout(() => {
          moveToNextFact();
        }, 500);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
      <BackButton onBack={() => navigate('/')} />
      <div className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center mb-6 animate-fade-in flex items-center justify-center gap-4">
          <FiZap className="text-yellow-400" size={32} />
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
            Learn Math Facts
          </span>
        </h1>
        
        <div className="flex gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 space-y-6 p-6 bg-white rounded-lg shadow-md"
          >
            {stage === 'teach' ? (
              <div className="text-center space-y-6">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                  Let's learn this fact:
                </h2>
                <div className="text-4xl font-bold text-gray-900 py-8">
                  {currentFact.operand1} {renderOperationSymbol(currentFact.operation)} {currentFact.operand2} = {currentFact.result}
                </div>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setStage('practice')}
                  translate="no"
                  className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300"
                >
                  I understand, let me try!
                </motion.button>
              </div>
            ) : (
              <div className="text-center space-y-6">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                  What is:
                </h2>
                <div className="text-4xl font-bold text-gray-900 py-8">
                  {currentFact.operand1} {renderOperationSymbol(currentFact.operation)} {currentFact.operand2} = 
                  <input 
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    value={userAnswer}
                    onChange={(e) => handleInputChange(e.target.value.replace(/\D/g, ''))}
                    className="ml-4 w-32 text-center border-b-2 border-gray-300 focus:border-blue-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    autoFocus
                  />
                </div>
                
                {isCorrect === null ? (
                  <div className="h-12" /> /* Spacer div to maintain layout */
                ) : isCorrect ? (
                  <div className="space-y-4">
                    <div className="text-xl font-bold text-green-500">
                      Correct! Well done!
                    </div>
                    <div className="h-1 w-full bg-gray-100 rounded overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.5, ease: "linear" }}
                        className="h-full bg-green-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-xl font-bold text-red-500">
                      Try again!
                    </div>
                    <div className="flex justify-center gap-4">
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setIsCorrect(null);
                          setUserAnswer('');
                        }}
                        className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300"
                      >
                        Try Again
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={showAgain}
                        className="w-full px-6 py-3 text-blue-500 hover:text-blue-600 font-medium bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        Show me again
                      </motion.button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* Touchpad Card */}
          {stage === 'practice' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-6 bg-white rounded-lg shadow-md"
            >
              <TouchpadInput
                value={userAnswer}
                onChange={handleInputChange}
                disabled={isCorrect !== null}
                showFeedback={isCorrect !== null}
                wasCorrect={isCorrect === true}
              />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
} 