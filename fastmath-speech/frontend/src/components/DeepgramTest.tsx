import React, { useState, useRef } from 'react';

export const DeepgramTest: React.FC = () => {
  const [status, setStatus] = useState('Not Connected');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startDeepgram = async () => {
    try {
      // Step 1: Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus('Got microphone access');

      // Step 2: Check browser support
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        throw new Error('Browser not supported - needs audio/webm support');
      }

      // Step 3: Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      // Step 4: Get Deepgram token from backend
      console.log('Fetching Deepgram token...');
      const tokenResponse = await fetch('http://localhost:3001/api/voice/deepgram/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Token response status:', tokenResponse.status);
      console.log('Token response headers:', tokenResponse.headers);
      
      if (!tokenResponse.ok) {
        const text = await tokenResponse.text();
        console.error('Token response body:', text);
        throw new Error(`Failed to get token: ${tokenResponse.status}`);
      }
      
      // Try to parse as JSON
      const responseText = await tokenResponse.text();
      console.log('Raw response:', responseText);
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
        console.log('Token response data:', responseData);
      } catch (e) {
        console.error('Failed to parse response as JSON:', e);
        throw new Error('Invalid response from token endpoint: ' + responseText.substring(0, 100));
      }
      
      const { token } = responseData;
      setStatus('Got Deepgram token');

      // Step 5: Connect to Deepgram WebSocket - SIMPLE VERSION
      const socket = new WebSocket('wss://api.deepgram.com/v1/listen', ['token', token]);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('✅ Deepgram WebSocket opened');
        setStatus('Connected to Deepgram');
      };

      socket.onmessage = (message) => {
        console.log('📨 Deepgram message:', message.data);
        try {
          const received = JSON.parse(message.data);
          
          // Only process transcription results
          if (received.channel?.alternatives?.[0]?.transcript) {
            const text = received.channel.alternatives[0].transcript;
            if (text && received.is_final) {
              setTranscript(prev => prev + ' ' + text);
              console.log('🎯 Final transcript:', text);
            }
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      };

      socket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setError('WebSocket error occurred');
      };

      socket.onclose = () => {
        console.log('🔚 WebSocket closed');
        setStatus('Disconnected');
      };

      // Step 6: Send audio data to Deepgram
      mediaRecorder.addEventListener('dataavailable', async (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          console.log(`📤 Sending ${event.data.size} bytes to Deepgram`);
          socket.send(event.data);
        }
      });

      // Step 7: Start recording (250ms chunks as recommended)
      mediaRecorder.start(250);
      setStatus('Recording and streaming to Deepgram');

    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('Failed');
    }
  };

  const stopDeepgram = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (socketRef.current) {
      socketRef.current.close();
    }
    setStatus('Stopped');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>Deepgram Simple Test</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button onClick={startDeepgram} style={{ marginRight: '10px' }}>
          Start Deepgram
        </button>
        <button onClick={stopDeepgram}>
          Stop
        </button>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Status:</strong> {status}
      </div>

      {error && (
        <div style={{ color: 'red', marginBottom: '10px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div>
        <strong>Transcript:</strong>
        <div style={{ 
          border: '1px solid #ccc', 
          padding: '10px', 
          minHeight: '100px',
          marginTop: '5px'
        }}>
          {transcript || '(No transcript yet)'}
        </div>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <h3>Console Log Legend:</h3>
        <div>✅ = Connected</div>
        <div>📨 = Message received</div>
        <div>📤 = Audio sent</div>
        <div>🎯 = Final transcript</div>
        <div>❌ = Error</div>
        <div>🔚 = Disconnected</div>
      </div>
    </div>
  );
};