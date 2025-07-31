import React, { useState, useRef, useEffect } from 'react';

export const WebSpeechTest: React.FC = () => {
  const [status, setStatus] = useState('Initializing...');
  const [transcript, setTranscript] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(message);
  };

  const startRecognition = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        addLog('❌ Speech Recognition API not available');
        setStatus('Not supported');
        return;
      }

      addLog('✅ Speech Recognition API available');
      
      const recognition = new SpeechRecognition();
      
      // Configure recognition
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.lang = 'en-US';
      
      addLog('📋 Configuration set');

      // All event handlers
      recognition.onstart = () => {
        addLog('✅ Recognition started');
        setStatus('Listening...');
      };

      recognition.onaudiostart = () => {
        addLog('🔊 Audio capture started');
      };

      recognition.onsoundstart = () => {
        addLog('🔊 Sound detected');
      };

      recognition.onspeechstart = () => {
        addLog('🗣️ Speech detected');
      };

      recognition.onresult = (event: any) => {
        addLog(`📝 Result event - resultIndex: ${event.resultIndex}, results length: ${event.results.length}`);
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          for (let j = 0; j < result.length; j++) {
            const alternative = result[j];
            addLog(`  Alternative ${j}: "${alternative.transcript}" (confidence: ${alternative.confidence}, final: ${result.isFinal})`);
            
            if (j === 0) { // Use the first alternative
              setTranscript(alternative.transcript);
            }
          }
        }
      };

      recognition.onnomatch = () => {
        addLog('❓ No match found');
      };

      recognition.onspeechend = () => {
        addLog('🔇 Speech ended');
      };

      recognition.onsoundend = () => {
        addLog('🔇 Sound ended');
      };

      recognition.onaudioend = () => {
        addLog('🔇 Audio capture ended');
      };

      recognition.onerror = (event: any) => {
        addLog(`❌ Error: ${event.error} - ${event.message || ''}`);
        setStatus(`Error: ${event.error}`);
        
        if (event.error === 'aborted') {
          addLog('🔄 Attempting to restart...');
          setTimeout(() => {
            try {
              recognition.start();
              addLog('✅ Restarted successfully');
            } catch (e: any) {
              addLog(`❌ Failed to restart: ${e.message}`);
            }
          }, 1000);
        }
      };

      recognition.onend = () => {
        addLog('🔚 Recognition ended');
        setStatus('Stopped');
      };

      recognitionRef.current = recognition;
      
      // Request microphone permission first
      addLog('🎤 Requesting microphone permission...');
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          addLog('✅ Microphone permission granted');
          
          // Check audio tracks
          const audioTracks = stream.getAudioTracks();
          addLog(`🎤 Audio tracks: ${audioTracks.length}`);
          audioTracks.forEach((track, index) => {
            addLog(`  Track ${index}: ${track.label} (enabled: ${track.enabled}, muted: ${track.muted})`);
          });
          
          // Start recognition
          try {
            recognition.start();
            addLog('🚀 Called recognition.start()');
          } catch (e: any) {
            addLog(`❌ Failed to start: ${e.message}`);
          }
        })
        .catch((err) => {
          addLog(`❌ Microphone permission denied: ${err.message}`);
          setStatus('Mic permission denied');
        });
        
    } catch (error: any) {
      addLog(`❌ Setup error: ${error.message}`);
      setStatus('Setup failed');
    }
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        addLog('⏹️ Stopped recognition');
      } catch (e: any) {
        addLog(`❌ Error stopping: ${e.message}`);
      }
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setTranscript('');
  };

  useEffect(() => {
    // Auto-start on mount
    startRecognition();
    
    return () => {
      stopRecognition();
    };
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Web Speech API Diagnostic Test</h1>
      
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Status</h2>
          <p className="text-lg">{status}</p>
        </div>
        
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-2">Transcript</h2>
          <div className="bg-gray-100 p-4 rounded min-h-[100px]">
            {transcript || <span className="text-gray-500">No transcript yet...</span>}
          </div>
        </div>
        
        <div className="flex gap-4">
          <button
            onClick={startRecognition}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Start Recognition
          </button>
          <button
            onClick={stopRecognition}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Stop Recognition
          </button>
          <button
            onClick={clearLogs}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Clear Logs
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Event Logs</h2>
        <div className="bg-gray-900 text-gray-100 p-4 rounded h-96 overflow-y-auto font-mono text-sm">
          {logs.map((log, index) => (
            <div key={index} className="mb-1">{log}</div>
          ))}
          {logs.length === 0 && (
            <div className="text-gray-500">No logs yet...</div>
          )}
        </div>
      </div>
    </div>
  );
};