import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Play } from 'lucide-react';
import { Fact } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import CountdownAnimation from '../ui/CountdownAnimation';
import { AccuracyPracticeSettings } from './AccuracyPracticePage';

interface SelectionScreenProps {
  onStart: (settings: AccuracyPracticeSettings) => void;
  facts: Fact[];
  errorMessage?: string | null;
}

const SelectionScreen: React.FC<SelectionScreenProps> = ({ 
  onStart, 
  facts, 
  errorMessage 
}) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const autoStartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(30); // 30 seconds for auto-start

  // Auto-start timer (30 seconds)
  useEffect(() => {
    if (!isLoading && !isFetching && facts.length > 0) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleStart();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      autoStartTimerRef.current = timer;
      
      return () => {
        clearInterval(timer);
      };
    }
  }, [facts, isLoading, isFetching]);

  // Add keyboard event listener for Enter key
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !isLoading && !isFetching && facts.length > 0) {
        handleStart();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [facts, isLoading, isFetching]);

  const handleStart = () => {
    if (facts.length === 0) return;
    
    // Clear the auto-start timer if it exists
    if (autoStartTimerRef.current) {
      clearInterval(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
    
    setIsLoading(true);
    setShowCountdown(true);
  };

  const handleCountdownComplete = () => {
    try {
      onStart({
        facts
      });
    } catch (error) {
      console.error('Failed to start accuracy practice:', error);
      setIsLoading(false);
      setShowCountdown(false);
    }
  };

  const buttonText = useMemo(() => {
    if (isLoading) return 'Starting...';
    if (isFetching) return 'Loading...';
    return 'Start Practice';
  }, [isLoading, isFetching]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
      {showCountdown && (
        <CountdownAnimation onComplete={handleCountdownComplete} />
      )}
      
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center mb-6 animate-fade-in flex items-center justify-center gap-4">
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
            Accuracy Practice
          </span>
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 p-6 bg-white rounded-lg shadow-md"
        >
          {isFetching ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-base text-gray-600">Loading practice...</p>
            </div>
          ) : (
            <>
              <div className="text-center space-y-6">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                  Instructions
                </h2>
                <ul className="space-y-3 text-base text-gray-600 max-w-2xl mx-auto text-left">
                  <li className="flex items-center gap-4">
                    <span className="font-bold text-blue-500 min-w-[1.5rem]">1.</span>
                    <span>This practice focuses on accuracy, not speed</span>
                  </li>
                  <li className="flex items-center gap-4">
                    <span className="font-bold text-blue-500 min-w-[1.5rem]">2.</span>
                    <span>Take your time to answer each question correctly</span>
                  </li>
                  <li className="flex items-center gap-4">
                    <span className="font-bold text-blue-500 min-w-[1.5rem]">3.</span>
                    <span>If you don't answer within 12 seconds, the answer will be shown</span>
                  </li>
                  <li className="flex items-center gap-4">
                    <span className="font-bold text-blue-500 min-w-[1.5rem]">5.</span>
                    <span>If you answer a question incorrectly, the correct answer will be shown</span>
                  </li>
                </ul>
              </div>

              {!isLoading && !isFetching && facts.length > 0 && (
                <div className="max-w-md mx-auto">
                  <div className="flex justify-between items-center text-sm text-gray-600 mb-2">
                    <span>Auto-starting in</span>
                    <span className="font-bold">{timeRemaining}s</span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-1000"
                      style={{ 
                        width: `${(timeRemaining / 30) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col items-center space-y-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStart}
                  disabled={isLoading || isFetching || facts.length === 0}
                  className={`w-full max-w-md mx-auto px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 
                    text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg 
                    transition-all duration-300 flex items-center justify-center gap-2
                    ${(isLoading || isFetching || facts.length === 0) && 'opacity-50 cursor-not-allowed'}`}
                >
                  <span>{buttonText}</span>
                  {!isLoading && !isFetching && <Play className="w-5 h-5" />}
                  {(isLoading || isFetching) && (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                </motion.button>
                
                {errorMessage && facts.length === 0 && (
                  <div className="text-red-500 font-medium text-center mt-2">
                    {errorMessage}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default SelectionScreen; 