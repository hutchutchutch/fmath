import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAward } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { updateUserFocusTrack } from '../../config/api';

interface TrackCompletionAlertProps {
  trackName: string;
  onContinue: () => void;
  currentTrackId?: string; // Optional prop to receive current track ID
  triggerType: 'facts_mastered' | 'cqpm_achieved'; // New prop to determine trigger type
}

const TrackCompletionAlert: React.FC<TrackCompletionAlertProps> = ({ 
  trackName, 
  onContinue,
  currentTrackId,
  triggerType
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlockNextTrack = async () => {
    if (!user?.userId) {
      setError("User not found. Please try again later.");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await updateUserFocusTrack(user.userId);
      
      if (response.success) {
        // Hard reload the page to fetch the new focus track from backend
        window.location.href = '/';
      } else {
        setError(response.message || "Failed to unlock next track. Please try again.");
      }
    } catch (err) {
      console.error("Error unlocking next track:", err);
      setError("An error occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProgressAssessment = () => {
    onContinue(); // Dismiss the alert
    navigate('/progress-assessment', {
      state: { returnTo: 'dashboard' }
    });
  };

  // Determine content based on trigger type
  const getContent = () => {
    if (triggerType === 'facts_mastered') {
      return {
        title: "Track Completed! 🎉",
        message: `Congratulations! You've mastered all the facts in ${trackName}. Keep up the great work!`
      };
    } else {
      return {
        title: "Target Speed Achieved! 🚀",
        message: `Amazing! You've achieved the target speed for ${trackName}. You're ready for the next challenge!`
      };
    }
  };

  const content = getContent();
  
  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full"
          style={{ width: 'inherit' }}
        >
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <FiAward className="text-emerald-500 w-12 h-12 mx-auto mb-4" />
            </motion.div>
            
            <motion.h3 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-xl font-semibold text-emerald-900 mb-2"
            >
              {content.title}
            </motion.h3>
            
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-base text-emerald-700 mb-4"
            >
              {content.message}
            </motion.p>
            
            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-500 mb-3 text-sm"
              >
                {error}
              </motion.p>
            )}
            
            <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 justify-center">
              <motion.button 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                whileHover={{ scale: isLoading ? 1 : 1.02 }}
                whileTap={{ scale: isLoading ? 1 : 0.98 }}
                onClick={handleUnlockNextTrack}
                disabled={isLoading}
                className={`px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    Unlocking...
                  </span>
                ) : (
                  "Unlock Next Track"
                )}
              </motion.button>
              
              {/* Only show "Take Speed Assessment" button when triggered by facts mastered */}
              {triggerType === 'facts_mastered' && (
                <motion.button 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-6 py-3 bg-white border border-emerald-300 text-emerald-600 rounded-lg font-bold text-base shadow-sm hover:shadow-md transition-all duration-300"
                  onClick={handleProgressAssessment}
                >
                  Take Speed Assessment
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TrackCompletionAlert; 