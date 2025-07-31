import React, { useState } from 'react';
import { VoiceExerciseWithComparison } from './components/VoiceExerciseWithComparison';
import { WebSpeechTest } from './components/WebSpeechTest';
import './index.css';

function App() {
  const [showTest, setShowTest] = useState(false);
  
  // Check URL parameter for test mode
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test') === 'webspeech') {
      setShowTest(true);
    }
  }, []);
  
  return (
    <div className="App">
      {showTest ? (
        <WebSpeechTest />
      ) : (
        <VoiceExerciseWithComparison />
      )}
    </div>
  );
}

export default App;