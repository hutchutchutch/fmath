import React, { useEffect, useRef, useState } from 'react';

interface SimpleDeepgramConnectionProps {
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onStatusChange: (status: string) => void;
  apiKey: string;
}

export const SimpleDeepgramConnection: React.FC<SimpleDeepgramConnectionProps> = ({
  onTranscript,
  onStatusChange,
  apiKey
}) => {
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const connect = async () => {
      try {
        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        // Check if browser supports webm
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
          throw new Error('Browser does not support audio/webm recording');
        }

        // Create MediaRecorder
        const mediaRecorder = new MediaRecorder(stream, { 
          mimeType: 'audio/webm',
          audioBitsPerSecond: 16000
        });
        mediaRecorderRef.current = mediaRecorder;

        // Connect to Deepgram - using the simple approach from their examples
        const socket = new WebSocket('wss://api.deepgram.com/v1/listen', [
          'token',
          apiKey
        ]);
        socketRef.current = socket;

        socket.onopen = () => {
          console.log('✅ Deepgram connected');
          onStatusChange('Connected');
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle different message types
            if (data.type === 'Results') {
              const transcript = data.channel?.alternatives?.[0]?.transcript || '';
              const isFinal = data.is_final || false;
              
              if (transcript) {
                onTranscript(transcript, isFinal);
              }
            }
          } catch (error) {
            console.error('Error parsing Deepgram message:', error);
          }
        };

        socket.onerror = (error) => {
          console.error('❌ Deepgram error:', error);
          onStatusChange('Error');
        };

        socket.onclose = () => {
          console.log('🔚 Deepgram disconnected');
          onStatusChange('Disconnected');
        };

        // Start recording and sending audio
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        // Start recording with 250ms chunks (recommended by Deepgram)
        mediaRecorder.start(250);

      } catch (error) {
        console.error('Failed to connect:', error);
        onStatusChange('Failed to connect');
      }
    };

    connect();

    // Cleanup
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [apiKey, onTranscript, onStatusChange]);

  return null; // This component doesn't render anything
};

// Usage example:
export const DeepgramExample: React.FC = () => {
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('Initializing...');

  return (
    <div>
      <SimpleDeepgramConnection
        apiKey="YOUR_API_KEY"
        onTranscript={(text, isFinal) => {
          if (isFinal) {
            setTranscript(prev => prev + ' ' + text);
          }
        }}
        onStatusChange={setStatus}
      />
      <p>Status: {status}</p>
      <p>Transcript: {transcript}</p>
    </div>
  );
};