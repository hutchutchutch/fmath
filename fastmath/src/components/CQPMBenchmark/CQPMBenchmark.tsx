import React, { useState } from 'react';
import CQPMBenchmarkSelectionScreen from './SelectionScreen';
import { Screen, Settings, BenchmarkResults } from './types';
import { useAuth } from '../../context/AuthContext';

// Use the existing QuestionScreen from ProgressAssessment
// This is fine since our Settings interface matches
import QuestionScreen from '../ProgressAssessment/QuestionScreen/QuestionScreen2';
import ResultScreen from '../ProgressAssessment/ResultScreen/ResultScreen';

const CQPMBenchmarkPage: React.FC = () => {
  const { user } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('selection');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [results, setResults] = useState<BenchmarkResults | null>(null);

  const handleStart = (benchmarkSettings: Settings) => {
    setSettings(benchmarkSettings);
    setCurrentScreen('question');
  };

  const handleEnd = (benchmarkResults: BenchmarkResults) => {
    setResults(benchmarkResults);
    setCurrentScreen('result');
  };

  return (
    <div>
      {currentScreen === 'selection' && (
        <CQPMBenchmarkSelectionScreen onStart={handleStart} />
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
        />
      )}
    </div>
  );
};

export default CQPMBenchmarkPage; 