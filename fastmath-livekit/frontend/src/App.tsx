import React, { useState } from 'react';
import { VoiceExerciseWithDirect } from './components/VoiceExerciseWithDirect';
import { WebSpeechTest } from './components/WebSpeechTest';
import { DeepgramTest } from './components/DeepgramTest';
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
      {testMode === 'webspeech' ? (
        <WebSpeechTest />
      ) : testMode === 'deepgram' ? (
        <DeepgramTest />
      ) : (
        <VoiceExerciseWithDirect />
      )}
    </div>
  );
}

export default App;