import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ExpandableMenuItem from './ui/GradeTracks';
import Logo from './common/Logo';
import { api } from '../api/apiClient';
import { ONBOARDING_ASSESSMENT_SEQUENCE } from '../types/constants';

interface OnboardingStatusResponse {
  action: 'complete' | 'start' | 'continue' | 'setFocus';
  trackId?: string;
  currentStep?: number;
}

type TrackStatus = 'locked' | 'inProgress' | 'completed';

const OnboardingAssessments: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<OnboardingStatusResponse | null>(null);
  const [trackStatuses, setTrackStatuses] = useState<Record<string, TrackStatus>>({});

  // Check onboarding status when component mounts or user returns from assessment
  const checkOnboardingStatus = async () => {
    if (!user?.userId) return;

    try {
      setLoading(true);
      const response = await api.get(`/onboarding/status/${user.userId}`);
      const status: OnboardingStatusResponse = response.data;
      setCurrentStatus(status);

      // Handle different actions
      switch (status.action) {
        case 'complete':
        case 'setFocus':
          // Hard-reload the app so AuthContext re-validates the token and fetches the updated profile.
          window.location.href = '/';
          return;
        
        case 'start':
        case 'continue':
          // Set the trackId in sessionStorage immediately when we get it from backend
          if (status.trackId) {
            sessionStorage.setItem('activeTrackId', status.trackId);
          }
          // Update track statuses for UI display
          updateTrackStatuses(status.trackId, status.currentStep || 1);
          break;
      }
    } catch (err) {
      console.error('Error checking onboarding status:', err);
      setError('Failed to load onboarding status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Update track statuses based on current progress
  const updateTrackStatuses = (currentTrackId?: string, currentStep: number = 1) => {
    const newStatuses: Record<string, TrackStatus> = {};
    
    ONBOARDING_ASSESSMENT_SEQUENCE.forEach((trackId: string, index: number) => {
      if (index < currentStep - 1) {
        // Previous tracks are completed
        newStatuses[trackId] = 'completed';
      } else if (trackId === currentTrackId) {
        // Current track is in progress
        newStatuses[trackId] = 'inProgress';
      } else {
        // Future tracks are locked
        newStatuses[trackId] = 'locked';
      }
    });
    
    setTrackStatuses(newStatuses);
  };

  // Determine which grade should be expanded based on in-progress track
  const getExpandedGrade = (): number | null => {
    // Grade to tracks mapping (same as in GradeTracks component)
    const GRADE_TO_TRACKS: Record<number, string[]> = {
      1: ['TRACK12'],
      2: ['TRACK9', 'TRACK10'],
      3: ['TRACK6', 'TRACK8', 'TRACK11'],
      4: ['TRACK7', 'TRACK5']
    };

    // Find which grade contains the in-progress track
    for (const [grade, tracks] of Object.entries(GRADE_TO_TRACKS)) {
      if (tracks.some(trackId => trackStatuses[trackId] === 'inProgress')) {
        return parseInt(grade);
      }
    }
    
    return null;
  };

  const expandedGrade = getExpandedGrade();

  // Handle starting an assessment
  const handleStartAssessment = () => {
    if (!currentStatus?.trackId) return;
    
    // Navigate to progress assessment with the current track
    navigate('/progress-assessment', {
      state: { 
        trackId: currentStatus.trackId,
        returnTo: 'onboarding'
      }
    });
  };

  // Check status when component mounts
  useEffect(() => {
    checkOnboardingStatus();
  }, [user?.userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assessment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-lg mb-4">{error}</div>
          <button
            onClick={checkOnboardingStatus}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-16 px-4 flex items-center justify-center border-b bg-white/50 backdrop-blur-sm"
      >
        <h1 className="text-4xl font-bold animate-fade-in flex items-center gap-3">
          <Logo size={36} />
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
            Fast Math
          </span>
        </h1>
      </motion.div>

      {/* 2-Column Layout */}
      <div className="mt-8 p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Grade Tracks */}
          <div className="space-y-4">
            <ExpandableMenuItem 
              grade={1} 
              trackStatuses={trackStatuses}
              expanded={expandedGrade === 1}
            />
            <ExpandableMenuItem 
              grade={2} 
              trackStatuses={trackStatuses}
              expanded={expandedGrade === 2}
            />
            <ExpandableMenuItem 
              grade={3} 
              trackStatuses={trackStatuses}
              expanded={expandedGrade === 3}
            />
            <ExpandableMenuItem 
              grade={4} 
              trackStatuses={trackStatuses}
              expanded={expandedGrade === 4}
            />
          </div>
          
          {/* Right Column - Instructions and Button */}
          <div className="space-y-6">
            {/* Instructions */}
            <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-4 text-lg">Assessment Instructions</h3>
              <ul className="text-gray-600 space-y-3">
                <li className="flex items-start">
                  <span className="text-blue-600 mr-3">•</span>
                  Complete each 2-minute assessment to find your optimal starting point
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-3">•</span>
                  Answer as many questions as you can accurately
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-3">•</span>
                  Assessment stops when you reach an appropriate difficulty level
                </li>
              </ul>
            </div>

            {/* Start/Continue Assessment Button */}
            {currentStatus && (currentStatus.action === 'start' || currentStatus.action === 'continue') && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStartAssessment}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg transition-colors duration-200 shadow-lg text-lg"
              >
                {currentStatus.action === 'start' ? 'Start Assessment' : 'Continue Assessment'}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingAssessments; 