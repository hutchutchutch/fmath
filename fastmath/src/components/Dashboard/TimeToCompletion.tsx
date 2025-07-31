import React, { useState, useEffect } from 'react';
import { FiClock, FiPlus, FiMinus, FiCalendar } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { getTimeToCompletion } from '../../config/api';
import { useLoading } from '../../context/LoadingContext';

interface TimeToCompletionProps {
  userId: string;
  isActive?: boolean;
  preloadedData?: any;
}

const TimeToCompletion: React.FC<TimeToCompletionProps> = ({
  userId,
  isActive = true,
  preloadedData = null
}) => {
  const [timePerDay, setTimePerDay] = useState(10);
  const [totalMinutes, setTotalMinutes] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const { registerLoadingComponent, setComponentLoading } = useLoading();

  useEffect(() => {
    if (preloadedData) {
      setTotalMinutes(preloadedData.totalMinutes);
      return;
    }

    const componentId = 'time-to-completion';
    registerLoadingComponent(componentId);

    if (!isActive || !userId) {
      setComponentLoading(componentId, false);
      return;
    }

    const fetchData = async () => {
      try {
        const timeEstimation = await getTimeToCompletion(userId);
        setTotalMinutes(timeEstimation.totalMinutes);
      } catch (err) {
        setError('Failed to load time estimation data');
        console.error('Error fetching time estimation data:', err);
      } finally {
        setComponentLoading(componentId, false);
      }
    };

    fetchData();
  }, [userId, isActive, registerLoadingComponent, setComponentLoading, preloadedData]);

  const handleTimeChange = (change: number) => {
    const newTime = Math.max(5, Math.min(60, timePerDay + change));
    setTimePerDay(newTime);
  };

  const daysToComplete = Math.ceil(totalMinutes / timePerDay);

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-6">
          <div className="text-red-500 text-center">
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
        <div className="px-4 pt-4">
          <h3 className="text-base font-semibold text-gray-700">Time to Completion</h3>
        </div>

        {/* Time Management Section */}
        <div className="p-3">
          <div className="space-y-3">
            {/* Time Per Day Control */}
            <div>
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <FiClock className="text-base" />
                <span className="text-sm font-medium">Daily Practice Goal</span>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg">
                <button
                  onClick={() => handleTimeChange(-5)}
                  className="p-1 rounded-full bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                >
                  <FiMinus size={12} />
                </button>
                <span className="flex-1 text-center font-bold text-gray-700">{timePerDay} min</span>
                <button
                  onClick={() => handleTimeChange(5)}
                  className="p-1 rounded-full bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                >
                  <FiPlus size={12} />
                </button>
              </div>
            </div>

            {/* Days to Complete */}
            <div>
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <FiCalendar className="text-base" />
                <span className="text-sm font-medium">Estimated Completion</span>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-700 mb-1">
                    {daysToComplete} days
                  </div>
                  <div className="text-xs text-gray-500">
                    at {timePerDay} minutes per day
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Total Time */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiClock className="text-blue-600 text-sm" />
              <span className="text-xs font-medium text-gray-600">Total Practice Time</span>
            </div>
            <span className="text-xs font-bold text-gray-700">
              {Math.floor(totalMinutes / 60) > 0 ? `${Math.floor(totalMinutes / 60)}h ` : ''}
              {totalMinutes % 60}m
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default TimeToCompletion; 