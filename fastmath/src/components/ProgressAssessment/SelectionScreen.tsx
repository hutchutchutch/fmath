import React, { useState, useEffect, useMemo } from 'react';
import { Play } from 'lucide-react';
import { Settings } from './types';
import { startProgressAssessment, getTargetTime } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import CountdownAnimation from '../ui/CountdownAnimation';

interface SelectionScreenProps {
  onStart: (settings: Settings) => void;
}

const SelectionScreen: React.FC<SelectionScreenProps> = ({ onStart }) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [questions, setQuestions] = useState<Settings['questions']>([]);
  const [assessmentId, setAssessmentId] = useState<string>('');
  const [timePerDigit, setTimePerDigit] = useState<number | null>(null);
  const [targetTime, setTargetTime] = useState<number | null>(null);
  const [showCountdown, setShowCountdown] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.userId) return;
      
      setIsFetching(true);
      try {
        // Fetch both target time and assessment data in parallel
        const [timeResponse, assessmentResponse] = await Promise.all([
          getTargetTime(user.userId),
          startProgressAssessment(user.userId)
        ]);
        
        if (!assessmentResponse.questions || !assessmentResponse.assessmentId) {
          throw new Error('Invalid response from server');
        }

        setTimePerDigit(timeResponse.timePerDigit);
        setTargetTime(timeResponse.targetTime);
        setQuestions(assessmentResponse.questions);
        setAssessmentId(assessmentResponse.assessmentId);
      } catch (error) {
        console.error('Failed to fetch assessment data:', error);
      } finally {
        setIsFetching(false);
      }
    };

    fetchData();
  }, [user?.userId]);

  // Add keyboard event listener for Enter key
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && 
          !isLoading && 
          !isFetching && 
          questions.length > 0 && 
          assessmentId && 
          timePerDigit !== null && 
          targetTime !== null) {
        handleStart();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [questions, isLoading, isFetching, assessmentId, timePerDigit, targetTime]);

  const handleStart = () => {
    if (questions.length === 0 || !assessmentId || timePerDigit === null || targetTime === null) return;
    setIsLoading(true);
    setShowCountdown(true);
  };

  const handleCountdownComplete = () => {
    try {
      if (questions.length === 0 || !assessmentId || timePerDigit === null || targetTime === null) return;
      
      onStart({
        inputMethod: 'typing',
        questions,
        assessmentId,
        timePerDigit,
        baseTime: targetTime
      });
    } catch (error) {
      console.error('Failed to start progress assessment:', error);
      setIsLoading(false);
      setShowCountdown(false);
    }
  };

  const buttonText = useMemo(() => {
    if (isLoading) return 'Starting...';
    if (isFetching) return 'Loading Questions...';
    return 'Start Assessment';
  }, [isLoading, isFetching]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col justify-center p-6">
      {showCountdown && (
        <CountdownAnimation onComplete={handleCountdownComplete} />
      )}
      
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center mb-6 animate-fade-in flex items-center justify-center gap-4">
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
            Assessment
          </span>
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 p-6 bg-white rounded-lg shadow-md"
        >
          <div className="text-center space-y-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
              Instructions
            </h2>
            <ul className="space-y-3 text-base text-gray-600 max-w-2xl mx-auto text-left">
              <li className="flex items-center gap-4">
                <span className="font-bold text-blue-500 min-w-[1.5rem]">1.</span>
                <span>You will have 2 minutes to complete the assessment</span>
              </li>
              <li className="flex items-center gap-4">
                <span className="font-bold text-blue-500 min-w-[1.5rem]">2.</span>
                <span>Answers will be auto-submitted once you type them</span>
              </li>
              <li className="flex items-center gap-4">
                <span className="font-bold text-blue-500 min-w-[1.5rem]">3.</span>
                <span>Answer as many questions as you can accurately</span>
              </li>
            </ul>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleStart}
            disabled={isLoading || isFetching || timePerDigit === null || targetTime === null}
            className={`w-full max-w-md mx-auto px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 
              text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg 
              transition-all duration-300 flex items-center justify-center gap-2
              ${(isLoading || isFetching || timePerDigit === null || targetTime === null) && 'opacity-50 cursor-not-allowed'}`}
          >
            <span>{buttonText}</span>
            {!isLoading && !isFetching && <Play className="w-5 h-5" />}
            {(isLoading || isFetching) && (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
};

export default SelectionScreen;