import React, { useState, useRef } from 'react';

export const AudioTest: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const startAudioTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create audio context and analyser
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      source.connect(analyserRef.current);
      
      setIsRecording(true);
      
      // Start monitoring audio levels
      const monitorAudio = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average level
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average);
        
        animationRef.current = requestAnimationFrame(monitorAudio);
      };
      
      monitorAudio();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopAudioTest = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    setIsRecording(false);
    setAudioLevel(0);
  };

  return (
    <div className="p-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Microphone Test</h2>
      
      <div className="mb-4">
        <button
          onClick={isRecording ? stopAudioTest : startAudioTest}
          className={`px-4 py-2 rounded ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {isRecording ? 'Stop Test' : 'Start Test'}
        </button>
      </div>
      
      <div className="mb-4">
        <div className="h-8 bg-gray-200 rounded overflow-hidden">
          <div 
            className="h-full bg-green-500 transition-all duration-100"
            style={{ width: `${(audioLevel / 255) * 100}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Audio Level: {Math.round(audioLevel)}
        </p>
      </div>
      
      <div className="text-sm text-gray-600">
        <p>Instructions:</p>
        <ol className="list-decimal ml-5">
          <li>Click "Start Test"</li>
          <li>Allow microphone access</li>
          <li>Speak into your microphone</li>
          <li>The green bar should move when you speak</li>
        </ol>
      </div>
    </div>
  );
};