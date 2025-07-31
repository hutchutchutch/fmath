import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAward, FiStar } from 'react-icons/fi';

interface FocusTrackAlertProps {
  trackName: string | null; // Allow null for "ALL" case
  onContinue: () => void;
  isAllTracks?: boolean; // New prop to indicate "ALL" state
}

const FocusTrackAlert: React.FC<FocusTrackAlertProps> = ({ 
  trackName, 
  onContinue,
  isAllTracks = false
}) => {
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
          <div className={`${isAllTracks ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200' : 'bg-emerald-50 border border-emerald-200'} rounded-lg p-6 text-center`}>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {isAllTracks ? (
                <FiStar className="text-yellow-500 w-12 h-12 mx-auto mb-4" />
              ) : (
                <FiAward className="text-emerald-500 w-12 h-12 mx-auto mb-4" />
              )}
            </motion.div>
            
            <motion.h3 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={`text-xl font-semibold ${isAllTracks ? 'text-yellow-900' : 'text-emerald-900'} mb-2`}
            >
              {isAllTracks ? 'Congratulations! 🌟' : 'Ready to Practice! 🎉'}
            </motion.h3>
            
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className={`text-base ${isAllTracks ? 'text-yellow-700' : 'text-emerald-700'} mb-4`}
            >
              {isAllTracks 
                ? "Amazing work! You've mastered all math fact tracks and now have access to practice any track you want!"
                : `Great! Let's start practicing math facts for ${trackName}`
              }
            </motion.p>
            
            <motion.button 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`px-6 py-3 ${isAllTracks 
                ? 'bg-gradient-to-r from-yellow-500 to-orange-600' 
                : 'bg-gradient-to-r from-emerald-500 to-green-600'
              } text-white rounded-lg font-bold text-base shadow-md hover:shadow-lg transition-all duration-300`}
              onClick={onContinue}
            >
              Continue
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FocusTrackAlert; 