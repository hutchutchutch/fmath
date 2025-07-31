import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import SelectionScreen from './SelectionScreen';
import QuestionScreen from './QuestionScreen/QuestionScreen';
import ResultScreen from './ResultScreen/ResultScreen';
import { Screen, Settings, PracticeResults } from './types';

const ProgressAssessmentPage: React.FC = () => {
  const location = useLocation();
  const [currentScreen, setCurrentScreen] = useState<Screen>('selection');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [results, setResults] = useState<PracticeResults | null>(null);
  const [returnTo, setReturnTo] = useState<string>('dashboard'); // Default to dashboard

  // Handle returnTo from navigation state
  useEffect(() => {
    const returnToFromState = location.state?.returnTo;
    
    if (returnToFromState) {
      setReturnTo(returnToFromState);
    }
  }, [location.state]);

  const handleStart = (practiceSettings: Settings) => {
    setSettings(practiceSettings);
    setCurrentScreen('question');
  };

  const handleEnd = (practiceResults: PracticeResults) => {
    setResults(practiceResults);
    setCurrentScreen('result');
  };

  return (
    <div>
      {currentScreen === 'selection' && (
        <SelectionScreen onStart={handleStart} />
      )}
      {currentScreen === 'question' && settings && (
        <QuestionScreen 
          settings={settings}
          questions={settings.questions}
          onEnd={handleEnd}
        />
      )}
      {currentScreen === 'result' && results && settings && (
        <ResultScreen 
          results={results}
          settings={settings}
          returnTo={returnTo}
        />
      )}
    </div>
  );
};

export default ProgressAssessmentPage;