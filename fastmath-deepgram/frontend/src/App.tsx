import React from 'react';
import { VoiceTranscription } from './components/VoiceTranscription';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>FastMath Deepgram Test</h1>
        <p>Minimalist LiveKit + Deepgram Implementation</p>
      </header>
      <main>
        <VoiceTranscription />
      </main>
    </div>
  );
}

export default App;