import React from 'react';
import { Timer, Hash, CheckCircle2, Target } from 'lucide-react';
import { PracticeResults, Settings } from '../types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { motion } from 'framer-motion';

interface ResultScreenProps {
  results: PracticeResults;
  settings: Settings;
  returnTo?: string;
}

const ResultScreen: React.FC<ResultScreenProps> = ({ results, settings, returnTo = 'dashboard' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const formatAccuracy = (accuracy: number): string => {
    return Math.round(accuracy).toString();
  };

  const handleContinue = () => {
    // Remove assessment from session storage
    sessionStorage.removeItem('currentAssessmentId');
    
    // Navigate based on where user came from
    if (returnTo === 'onboarding') {
      navigate('/onboarding');
    } else {
      navigate('/'); // Default to dashboard
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center mb-6 animate-fade-in flex items-center justify-center gap-4">
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
            Assessment Results
          </span>
        </h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow-md p-6"
          >
            <div className="flex flex-col">
              <span className="text-gray-500 text-base mb-1">Speed Score</span>
              <div className="flex justify-between items-center">
                <span className="text-[2.5rem] font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                  {results.cqpm}
                </span>
                <Timer className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow-md p-6"
          >
            <div className="flex flex-col">
              <span className="text-gray-500 text-base mb-1">Attempts</span>
              <div className="flex justify-between items-center">
                <span className="text-[2.5rem] font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                  {results.totalAttempted}
                </span>
                <Hash className="w-6 h-6 text-blue-500 stroke-[2]" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-lg shadow-md p-6"
          >
            <div className="flex flex-col">
              <span className="text-gray-500 text-base mb-1">Correct</span>
              <div className="flex justify-between items-center">
                <span className="text-[2.5rem] font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                  {results.correctAnswers}
                </span>
                <CheckCircle2 className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-lg shadow-md p-6"
          >
            <div className="flex flex-col">
              <span className="text-gray-500 text-base mb-1">Accuracy</span>
              <div className="flex justify-between items-center">
                <span className="text-[2.5rem] font-bold bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
                  {formatAccuracy(results.accuracy)}%
                </span>
                <Target className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Continue Button */}
        <div className="flex justify-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleContinue}
            className="w-full max-w-md px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 
              text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg 
              transition-all duration-300"
          >
            Continue
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default ResultScreen;