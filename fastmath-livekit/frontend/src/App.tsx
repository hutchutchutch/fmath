import React, { useState } from 'react';
import { VoiceExerciseWithDeepgram } from './components/VoiceExerciseWithDeepgram';
import { DeepgramTest } from './components/DeepgramTest';
import { AudioTest } from './components/AudioTest';
import './index.css';

function App() {
  const [testMode, setTestMode] = useState('');
  
  // Check URL parameter for test mode
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const test = urlParams.get('test');
    if (test) {
      setTestMode(test);
    }
  }, []);
  
  return (
    <div className="App">
      {testMode === 'deepgram' ? (
        <DeepgramTest />
      ) : testMode === 'audio' ? (
        <AudioTest />
      ) : (
        <VoiceExerciseWithDeepgram />
      )}
    </div>
  );
}

export default App;