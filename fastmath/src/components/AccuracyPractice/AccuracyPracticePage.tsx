import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSession } from '../../config/api';
import { Fact } from '../../types';
import SelectionScreen from './SelectionScreen';
import QuestionScreen from './QuestionScreen';
import { motion } from 'framer-motion';
import { useSession } from '../../context/SessionContext';

type Screen = 'selection' | 'question';

export interface AccuracyPracticeSettings {
  facts: Fact[];
}

// Define a type for facts with progressStatus
interface FactWithStatus extends Fact {
  progressStatus?: string;
}

// Helper function to manage practiceContext in session storage
const updatePracticeContext = (pageType: 'accuracy' | 'fluency') => {
  const today = new Date().toLocaleDateString(); // User's timezone
  const stored = sessionStorage.getItem('practiceContext');
  
  let contextData = {
    date: today,
    accuracyCount: 0,
    fluencyCount: 0,
    current: ''
  };
  
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // If it's a new day, reset counters
      if (parsed.date !== today) {
        contextData = {
          date: today,
          accuracyCount: 0,
          fluencyCount: 0,
          current: ''
        };
      } else {
        contextData = parsed;
      }
    } catch (error) {
      console.error('Error parsing practiceContext:', error);
    }
  }
  
  // Increment the appropriate counter
  if (pageType === 'accuracy') {
    contextData.accuracyCount++;
    contextData.current = `accuracy${contextData.accuracyCount}`;
  } else {
    contextData.fluencyCount++;
    contextData.current = `fluency${contextData.fluencyCount}`;
  }
  
  sessionStorage.setItem('practiceContext', JSON.stringify(contextData));
  return contextData.current;
};

const AccuracyPracticePage: React.FC = () => {
  const { user } = useAuth();
  const { recordPageTransition } = useSession();
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>('selection');
  const [facts, setFacts] = useState<Fact[]>([]);
  const [practiceFacts, setPracticeFacts] = useState<FactWithStatus[]>([]);
  const [otherFacts, setOtherFacts] = useState<FactWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  
  useEffect(() => {
    // Update practice context when page loads
    const practiceContext = updatePracticeContext('accuracy');
    console.log('Practice context updated:', practiceContext);
    
    const fetchSessionData = async () => {
      if (!user?.userId) return;
      
      try {
        setIsLoading(true);
        const sessionResponse = await getSession(user.userId, 'accuracyPractice');
        
        if (!sessionResponse.availableActivities.accuracyPractice) {
          setError('No accuracy practice activities available for today.');
          setFacts([]);
          setPracticeFacts([]);
          setOtherFacts([]);
          return;
        }
        
        const accuracyFacts = sessionResponse.availableActivities.accuracyPractice.facts;
        setFacts(accuracyFacts);
        
        const allFacts = sessionResponse.availableActivities.accuracyPractice.facts as FactWithStatus[];
        
        // Group facts based on progressStatus
        const practice: FactWithStatus[] = [];
        const others: FactWithStatus[] = [];
        
        allFacts.forEach(fact => {
          // Include facts with status 'accuracyPractice' in practice facts
          if (fact.progressStatus === 'accuracyPractice') {
            practice.push(fact);
          } else {
            others.push(fact);
          }
        });
        
        // Store the grouped facts
        setPracticeFacts(practice);
        setOtherFacts(others);
        
        // Set all facts for the UI
        setFacts(allFacts);
        
        // Record page transition with ONLY practiceFacts IDs, not all facts
        if (practice.length > 0) {
          const practiceFactIds = practice.map(fact => fact.factId);
          recordPageTransition('accuracy-practice', {
            accuracyPractice: practiceFactIds
          });
        } else {
          recordPageTransition('accuracy-practice');
        }
        
        setError(null);
      } catch (error) {
        console.error('Failed to fetch session data:', error);
        setError('Failed to load accuracy practice. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSessionData();
  }, [user?.userId]);
  
  // Redirect to fluency practice if no facts are available
  useEffect(() => {
    console.log('[AccuracyPage] Checking redirect condition:', { 
      isLoading, 
      factsLength: facts.length, 
      userNull: user === null,
      redirecting,
      timestamp: new Date().toISOString(),
      location: window.location.pathname
    });
    
    if (!isLoading && facts.length === 0) {
      console.log('[AccuracyPage] Triggering redirect due to empty facts array');
      setRedirecting(true);
      
      const countdownInterval = setInterval(() => {
        setRedirectCountdown(prev => {
          if (prev <= 1) {
            console.log('[AccuracyPage] Redirect countdown completed, navigating to fluency practice');
            clearInterval(countdownInterval);
            // Redirect to fluency practice
            window.location.href = '/fluency-practice';
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(countdownInterval);
    }
  }, [isLoading, facts.length]);
  
  const handleStart = (settings: AccuracyPracticeSettings) => {
    setFacts(settings.facts);
    setScreen('question');
  };
  
  const handleComplete = () => {
    navigate('/fluency-practice');
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading accuracy practice...</p>
        </div>
      </div>
    );
  }
  
  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Skipping to fluency practice... ({redirectCountdown})</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {screen === 'selection' && (
        <SelectionScreen 
          onStart={handleStart} 
          facts={facts}
          errorMessage={error} 
        />
      )}
      
      {screen === 'question' && facts.length > 0 && (
        <QuestionScreen 
          questions={facts}
          practiceFacts={practiceFacts.map(fact => fact.PK)} 
          otherFacts={otherFacts.map(fact => fact.PK)}
          onComplete={handleComplete} 
        />
      )}
    </div>
  );
};

export default AccuracyPracticePage; 