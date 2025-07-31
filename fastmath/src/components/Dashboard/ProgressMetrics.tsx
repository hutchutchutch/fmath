import React, { useState, useEffect } from 'react';
import { FiActivity, FiTarget, FiArrowRight, FiBarChart2 } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { getProgressMetrics, createProgressAssessment } from '../../config/api';
import { useLoading } from '../../context/LoadingContext';
import { useAuth } from '../../context/AuthContext';

interface ProgressMetricsProps {
  userId: string;
  targetCQPM?: number;
  onProgressAssessment: () => void;
  isActive?: boolean;
  preloadedData?: any;
  showRetakeButton?: boolean;
  /** Callback triggered when user meets target CQPM score, enabling track completion */
  onTargetAchieved?: () => void;
  assessmentAvailable?: boolean;
  assessmentMessage?: string;
}

const ProgressMetrics: React.FC<ProgressMetricsProps> = ({
  userId,
  targetCQPM,
  onProgressAssessment,
  isActive = false,
  preloadedData = null,
  showRetakeButton = true,
  onTargetAchieved,
  assessmentAvailable = true,
  assessmentMessage = 'Ready to test-out to the next track? Take an assessment.'
}) => {
  const [currentCQPM, setCurrentCQPM] = useState<number | null>(null);
  const [changeCQPM, setChangeCQPM] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { registerLoadingComponent, setComponentLoading } = useLoading();
  const { user } = useAuth();

  // Track if we've already triggered completion to prevent race conditions
  const [hasTriggeredCompletion, setHasTriggeredCompletion] = useState(false);

  const handleAssessmentStart = async () => {
    try {
      onProgressAssessment(); // Call the parent callback to navigate to assessment page
    } catch (err) {
      console.error('Error starting assessment:', err);
      setError('Failed to start assessment');
    }
  };

  useEffect(() => {
    if (preloadedData) {
      setCurrentCQPM(preloadedData.currentCQPM);
      setChangeCQPM(preloadedData.changeCQPM);
      return;
    }

    const componentId = 'progress-metrics';
    registerLoadingComponent(componentId);

    if (!isActive || !userId) {
      setComponentLoading(componentId, false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch progress metrics
        const metrics = await getProgressMetrics(userId);
        setCurrentCQPM(metrics.currentCQPM);
        setChangeCQPM(metrics.changeCQPM);
      } catch (err) {
        setError('Failed to load progress data');
        console.error('Error fetching progress data:', err);
      } finally {
        setComponentLoading(componentId, false);
      }
    };

    fetchData();
  }, [userId, isActive, registerLoadingComponent, setComponentLoading, preloadedData]);

  // Check if user has met target CQPM and trigger track completion
  // This allows users to complete tracks by demonstrating sufficient fluency speed
  useEffect(() => {
    if (currentCQPM !== null && 
        targetCQPM !== undefined && 
        currentCQPM >= targetCQPM && 
        currentCQPM > 0 && 
        onTargetAchieved &&
        !hasTriggeredCompletion) {
      onTargetAchieved();
      setHasTriggeredCompletion(true);
    }
  }, [currentCQPM, targetCQPM, onTargetAchieved, hasTriggeredCompletion]);

  // Calculate how far current is from target (positive means current is higher)
  // Fix: ensure we handle the case when currentCQPM is 0 properly
  const targetGap = (currentCQPM !== null && targetCQPM !== undefined) 
    ? currentCQPM - targetCQPM 
    : -1; // Default to negative gap if either value is missing

  if (!isActive) {
    return null;
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-3">
          <div className="text-red-500 text-center text-sm">
            {error}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-3 pt-3">
          <h3 className="text-sm font-semibold text-gray-700">Progress Metrics</h3>
        </div>
        
        {/* Primary Metric */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <FiActivity className="text-sm" />
            <span className="text-xs font-medium">Current Speed Score</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline">
              <div className="text-xl font-bold text-blue-700 tracking-tight">
                {currentCQPM?.toFixed(1) || '0.0'}
              </div>
              {changeCQPM !== null && (
                <div className={`ml-2 flex items-baseline ${changeCQPM >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <span className="text-sm font-medium">
                    {changeCQPM >= 0 ? '↑' : '↓'}{Math.abs(changeCQPM).toFixed(1)}
                  </span>
                  <span className="text-[10px] ml-1 opacity-80">
                    {changeCQPM >= 0 ? 'higher' : 'lower'} than last test
                  </span>
                </div>
              )}
            </div>
            {targetCQPM && currentCQPM !== null && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ease-out ${targetGap >= 0 ? 'bg-green-500' : 'bg-yellow-500'}`}
                    style={{ width: `${Math.min((currentCQPM / targetCQPM) * 100, 100)}%` }}
                  />
                </div>
                <div className={`text-xs font-medium whitespace-nowrap ${targetGap >= 0 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {targetGap >= 0 ? (
                    <>{targetGap.toFixed(1)} higher than target!</>
                  ) : (
                    <>{Math.abs(targetGap).toFixed(1)} to go</>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="px-3 py-2 bg-gray-50 border-t border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiTarget className="text-blue-600 text-sm" />
              <span className="text-xs font-medium text-gray-600">Target Speed Score</span>
            </div>
            <span className="text-xs font-bold text-gray-700">{targetCQPM?.toFixed(1) || '0.0'}</span>
          </div>
        </div>

        {/* Congratulatory message when targetGap >= 0 AND currentCQPM > 0 */}
        {targetGap >= 0 && currentCQPM !== null && currentCQPM > 0 && targetCQPM && targetCQPM > 0 && (
          <div className="px-3 py-3 bg-green-50 border-t border-b border-green-100">
            <p className="text-xs text-green-700 font-medium">
              🎉 Congratulations, you have proved fluency in this operation! Track completion unlocked!
            </p>
          </div>
        )}

        {/* Footer with Button */}
        {showRetakeButton && assessmentAvailable && (
          <div className="p-2 bg-gray-50 border-t border-gray-100">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAssessmentStart}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-sm hover:shadow transition-all duration-300"
            >
              <FiArrowRight size={12} />
              <span className="text-xs font-medium">Retake Test</span>
            </motion.button>
          </div>
        )}
        
      </div>
    </motion.div>
  );
};

export default ProgressMetrics; 