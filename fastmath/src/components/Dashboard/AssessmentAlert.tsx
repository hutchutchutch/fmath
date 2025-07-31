import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

interface AssessmentAlertProps {
  type: 'initial' | 'progress';
  trackName: string;
}

const AssessmentAlert: React.FC<AssessmentAlertProps> = ({ type, trackName }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate('/progress-assessment');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4 mb-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={handleClick}
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {type === 'initial' ? (
            <AlertTriangle className="h-6 w-6 text-yellow-600" />
          ) : (
            <TrendingUp className="h-6 w-6 text-orange-600" />
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            {type === 'initial' ? 'Start Learning' : 'Progress Assessment Available'}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {type === 'initial' 
              ? `Start learning ${trackName}! Click here to begin.`
              : `Time to check your progress in ${trackName}! Take a quick assessment to see how far you've come.`
            }
          </p>
          <p className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700">
            {type === 'initial' ? 'Start Now →' : 'Start Assessment →'}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default AssessmentAlert;