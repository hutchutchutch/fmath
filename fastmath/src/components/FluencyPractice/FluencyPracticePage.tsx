import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSession } from '../../config/api';
import { Fact } from '../../types';
import SelectionScreen from './SelectionScreen';
import QuestionScreen from './QuestionScreen';
import { useSession } from '../../context/SessionContext';

type Screen = 'selection' | 'question';

export interface FluencyPracticeSettings {
  facts: Fact[];
  timerDuration: number; // Duration of green zone in seconds
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

// Define the fluency levels and their corresponding timer durations
const FLUENCY_LEVELS = {
  '6s': 6,
  '3s': 3,
  '2s': 2,
  '1.5s': 1.5,
  '1s': 1
};

type FluencyLevel = keyof typeof FLUENCY_LEVELS;

// Define the structure for grouped facts
interface GroupedFacts {
  [key: string]: Fact[];
}

// Helper function to map fluency level to factsByStage key
const mapFluencyLevelToStageKey = (level: FluencyLevel): string => {
  switch(level) {
    case '6s': return 'fluency6Practice';
    case '3s': return 'fluency3Practice';
    case '2s': return 'fluency2Practice';
    case '1.5s': return 'fluency1_5Practice';
    case '1s': return 'fluency1Practice';
    default: return 'fluency6Practice';
  }
};

// Helper function to group facts for a specific fluency level
const groupFactsByFluencyLevel = (facts: Fact[], level: FluencyLevel): { practice: FactWithStatus[], others: FactWithStatus[] } => {
  const stageKey = mapFluencyLevelToStageKey(level);
  const practice: FactWithStatus[] = [];
  const others: FactWithStatus[] = [];
  
  facts.forEach((fact: Fact) => {
    const factWithStatus = fact as FactWithStatus;
    
    // For 6s level, include both fluency6Practice and accuracyPractice facts
    if (level === '6s' && factWithStatus.progressStatus && 
        (factWithStatus.progressStatus === stageKey || factWithStatus.progressStatus === 'accuracyPractice')) {
      practice.push(factWithStatus);
    } 
    // For other levels, only include facts with progressStatus that exactly matches the current fluency level
    else if (factWithStatus.progressStatus && factWithStatus.progressStatus === stageKey) {
      practice.push(factWithStatus);
    } else {
      others.push(factWithStatus);
    }
  });
  
  return { practice, others };
};

const FluencyPracticePage: React.FC = () => {
  const { user } = useAuth();
  const { recordPageTransition } = useSession();
  const [screen, setScreen] = useState<Screen>('selection');
  const [facts, setFacts] = useState<Fact[]>([]);
  const [practiceFacts, setPracticeFacts] = useState<FactWithStatus[]>([]);
  const [otherFacts, setOtherFacts] = useState<FactWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  
  // Store available fluency levels and their facts
  const [availableLevels, setAvailableLevels] = useState<FluencyLevel[]>([]);
  const [groupedFacts, setGroupedFacts] = useState<Record<FluencyLevel, Fact[]>>({} as Record<FluencyLevel, Fact[]>);
  
  // Track the current fluency level index
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [timerDuration, setTimerDuration] = useState<number>(6); // Default to 6 seconds
  
  // Track if we've completed all levels
  const [completedAllLevels, setCompletedAllLevels] = useState(false);
  
  useEffect(() => {
    // Update practice context when page loads
    const practiceContext = updatePracticeContext('fluency');
    console.log('Practice context updated:', practiceContext);
    
    const fetchSessionData = async () => {
      if (!user?.userId) return;
      
      try {
        setIsLoading(true);
        const sessionResponse = await getSession(user.userId, 'fluencyPractice');
        
        if (!sessionResponse.availableActivities.fluencyPractice) {
          setError('No fluency practice activities available for today.');
          setFacts([]);
          setPracticeFacts([]);
          setOtherFacts([]);
          return;
        }
        
        // Get the grouped facts from the response
        const fluencyData = sessionResponse.availableActivities.fluencyPractice;
        
        // Handle both response formats (grouped facts or specific level)
        let groupedFactsData: GroupedFacts = {};
        
        if (fluencyData.groupedFacts) {
          // General fluencyPractice response with grouped facts
          groupedFactsData = fluencyData.groupedFacts as GroupedFacts;
        } else if (fluencyData.facts && fluencyData.fluencyLevel) {
          // Specific fluency level response
          groupedFactsData = {
            [fluencyData.fluencyLevel]: fluencyData.facts
          } as GroupedFacts;
        } else {
          setError('Invalid fluency practice data format.');
          return;
        }
        
        // Determine which fluency levels are available (have facts)
        const levels = Object.keys(groupedFactsData).filter(
          level => groupedFactsData[level]?.length > 0
        ) as FluencyLevel[];
        
        if (levels.length === 0) {
          setError('No fluency practice facts available for today.');
          return;
        }
        
        // Sort levels by duration (descending)
        levels.sort((a, b) => FLUENCY_LEVELS[b] - FLUENCY_LEVELS[a]);
        
        setAvailableLevels(levels);
        setGroupedFacts(groupedFactsData as Record<FluencyLevel, Fact[]>);
        
        // Set the initial facts to the first available level
        const initialLevel = levels[0];
        const initialFacts = groupedFactsData[initialLevel] || [];
        
        // Group facts based on progressStatus for the initial level
        const { practice, others } = groupFactsByFluencyLevel(initialFacts, initialLevel);
        
        // Store the grouped facts
        setPracticeFacts(practice);
        setOtherFacts(others);
        
        // Set all facts for the UI
        setFacts(initialFacts);
        setTimerDuration(FLUENCY_LEVELS[initialLevel]);
        setError(null);
      } catch (error) {
        console.error('Failed to fetch session data:', error);
        setError('Failed to load fluency practice. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSessionData();
  }, [user?.userId]);
  
  // Redirect to dashboard if no facts are available
  useEffect(() => {
    if (!isLoading && (availableLevels.length === 0 || facts.length === 0)) {
      setRedirecting(true);
      
      const countdownInterval = setInterval(() => {
        setRedirectCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            // Redirect to dashboard
            window.location.href = '/';
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(countdownInterval);
    }
  }, [isLoading, availableLevels.length, facts.length]);
  
  // Prepare factsByStage object for the current fluency level
  const prepareFactsByStage = (level: FluencyLevel, factsToTrack: Fact[]) => {
    const stageKey = mapFluencyLevelToStageKey(level);
    
    return {
      [stageKey]: factsToTrack.map(fact => fact.factId)
    };
  };
  
  const handleStart = (settings: FluencyPracticeSettings) => {
    // Always start with the first available level
    setCurrentLevelIndex(0);
    
    if (availableLevels.length > 0) {
      const initialLevel = availableLevels[0];
      setTimerDuration(FLUENCY_LEVELS[initialLevel]);
      
      // Use the facts from the grouped facts for the initial level
      const levelFacts = groupedFacts[initialLevel] || [];
      setFacts(levelFacts);
      
      // Group facts based on progressStatus for the initial level
      const { practice, others } = groupFactsByFluencyLevel(levelFacts, initialLevel);
      
      // Update the grouped facts
      setPracticeFacts(practice);
      setOtherFacts(others);
      
      // Record page transition with ONLY practice facts by stage
      if (user?.userId && practice.length > 0) {
        const factsByStage = prepareFactsByStage(initialLevel, practice);
        recordPageTransition('fluency-practice', factsByStage);
      } else {
        recordPageTransition('fluency-practice');
      }
    }
    
    setCompletedAllLevels(false);
    setScreen('question');
  };
  
  const handleComplete = () => {
    // Move to the next fluency level
    const nextIndex = currentLevelIndex + 1;
    
    // Check if we've completed all fluency levels
    if (nextIndex >= availableLevels.length) {
      // We've gone through all fluency levels, redirect to dashboard
      setCompletedAllLevels(true);
      // Remove endActivity call
      window.location.href = '/';
    } else {
      // Move to the next fluency level
      setCurrentLevelIndex(nextIndex);
      const nextLevel = availableLevels[nextIndex];
      setTimerDuration(FLUENCY_LEVELS[nextLevel]);
      
      // Update facts for the new level
      const levelFacts = groupedFacts[nextLevel] || [];
      setFacts(levelFacts);
      
      // Group facts based on progressStatus for the new level
      const { practice, others } = groupFactsByFluencyLevel(levelFacts, nextLevel);
      
      // Update the grouped facts
      setPracticeFacts(practice);
      setOtherFacts(others);
      
      // Record page transition with ONLY practice facts by stage for the new level
      if (user?.userId && practice.length > 0) {
        const factsByStage = prepareFactsByStage(nextLevel, practice);
        recordPageTransition('fluency-practice', factsByStage);
      } else {
        recordPageTransition('fluency-practice');
      }
    }
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading fluency practice...</p>
        </div>
      </div>
    );
  }
  
  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Skipping to dashboard... ({redirectCountdown})</p>
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
          timerDuration={timerDuration}
        />
      )}
    </div>
  );
};

export default FluencyPracticePage; 