import React, { useState, useEffect } from 'react';

interface DebugPanelProps {
  show: boolean;
  webSpeechStatus: string;
  deepgramStatus: string;
  groqStatus?: string;
  webSpeechValue: string;
  deepgramValue: string;
  groqValue?: string;
  latencies: {
    webSpeech: number | null;
    deepgram: number | null;
    groq?: number | null;
    webSpeechProblem?: number | null;
    deepgramProblem?: number | null;
    groqProblem?: number | null;
  };
  problemStartTime?: number;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  show,
  webSpeechStatus,
  deepgramStatus,
  groqStatus,
  webSpeechValue,
  deepgramValue,
  groqValue,
  latencies,
  problemStartTime
}) => {
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Update current time every 100ms for live timer
  useEffect(() => {
    if (!show) return;
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 100);
    
    return () => clearInterval(interval);
  }, [show]);
  
  if (!show) return null;
  
  // Calculate current time to answer if problem has started
  const currentTimeToAnswer = problemStartTime ? currentTime - problemStartTime : null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-white p-4 rounded-lg text-xs font-mono max-w-md">
      <h3 className="font-bold mb-2">Debug Panel</h3>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-blue-300">Web Speech Status:</span>
          <span>{webSpeechStatus}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-blue-300">Web Speech Value:</span>
          <span>{webSpeechValue || 'none'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-blue-300">Web Speech Latency:</span>
          <span>{latencies.webSpeech !== null ? `${latencies.webSpeech}ms` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-blue-300">Web Speech Response:</span>
          <span>{latencies.webSpeechProblem !== null ? `${latencies.webSpeechProblem}ms` : 'N/A'}</span>
        </div>
        
        <div className="border-t border-gray-600 my-2"></div>
        
        <div className="flex justify-between">
          <span className="text-purple-300">Deepgram Status:</span>
          <span>{deepgramStatus}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-purple-300">Deepgram Value:</span>
          <span>{deepgramValue || 'none'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-purple-300">Deepgram Response:</span>
          <span>{latencies.deepgramProblem !== null ? `${latencies.deepgramProblem}ms` : 'N/A'}</span>
        </div>
        
        {groqStatus !== undefined && (
          <>
            <div className="border-t border-gray-600 my-2"></div>
            
            <div className="flex justify-between">
              <span className="text-orange-300">Groq/Whisper Status:</span>
              <span>{groqStatus}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-orange-300">Groq/Whisper Value:</span>
              <span>{groqValue || 'none'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-orange-300">Groq/Whisper Response:</span>
              <span>{latencies.groqProblem !== null ? `${latencies.groqProblem}ms` : 'N/A'}</span>
            </div>
          </>
        )}
        
        <div className="border-t border-gray-600 my-2"></div>
        
        <div className="flex justify-between">
          <span className="text-yellow-300">Time to Answer:</span>
          <span className="text-yellow-400 font-bold">
            {currentTimeToAnswer !== null ? `${Math.floor(currentTimeToAnswer / 1000)}.${(currentTimeToAnswer % 1000).toString().padStart(3, '0')}s` : 'N/A'}
          </span>
        </div>
      </div>
      
      <div className="mt-2 text-xs text-gray-400">
        Press D to toggle debug panel
      </div>
    </div>
  );
};