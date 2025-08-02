import React, { useState, useRef, useEffect } from 'react';
import { Room, RoomEvent, createLocalTracks } from 'livekit-client';

interface Transcription {
  text: string;
  latency: number;
  timestamp: number;
  isFinal?: boolean;
}

export const VoiceTranscription: React.FC = () => {
  const [status, setStatus] = useState('Disconnected');
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const roomRef = useRef<Room | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const setupAudioLevelMonitoring = (mediaStreamTrack: MediaStreamTrack) => {
    try {
      // Create audio context and analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      
      // Create media stream source
      const mediaStream = new MediaStream([mediaStreamTrack]);
      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      
      // Monitor audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const checkAudioLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalizedLevel = Math.min(100, Math.round((average / 255) * 100));
        
        setAudioLevel(normalizedLevel);
        
        // Continue monitoring
        animationRef.current = requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
      console.log('Audio level monitoring started');
      
    } catch (error) {
      console.error('Failed to setup audio monitoring:', error);
    }
  };

  const connectToLiveKit = async () => {
    try {
      setStatus('Connecting...');
      
      // Get token from backend
      const roomName = `test-room-${Date.now()}`;
      const response = await fetch('http://localhost:3001/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          roomName,
          participantName: 'test-user'
        })
      });
      
      const { token, url } = await response.json();
      
      // Create and connect to room
      const room = new Room();
      
      room.on(RoomEvent.Connected, () => {
        console.log('Connected to LiveKit room');
        setStatus('Connected');
        setIsConnected(true);
        startTranscriptionMonitoring();
      });
      
      room.on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from LiveKit');
        setStatus('Disconnected');
        setIsConnected(false);
      });
      
      await room.connect(url, token);
      roomRef.current = room;
      
      // Create and publish audio track
      const tracks = await createLocalTracks({ audio: true, video: false });
      
      if (tracks.length > 0) {
        await room.localParticipant.publishTrack(tracks[0]);
        console.log('Published audio track');
        
        // Monitor audio levels
        const audioTrack = tracks[0];
        console.log('Audio track:', audioTrack);
        
        // Set up Web Audio API for real audio level monitoring
        if (audioTrack && audioTrack.mediaStreamTrack) {
          setupAudioLevelMonitoring(audioTrack.mediaStreamTrack);
        }
      }
      
      // Join backend to the room
      await fetch('http://localhost:3001/api/livekit/join-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName })
      });
      
    } catch (error) {
      console.error('Connection error:', error);
      setStatus('Connection failed');
    }
  };

  const startTranscriptionMonitoring = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    const eventSource = new EventSource('http://localhost:3001/api/livekit/transcriptions');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'transcription') {
        const displayTime = Date.now();
        const totalLatency = displayTime - data.audioStartTime;
        console.log('Received transcription:', data, 'Display latency:', totalLatency);
        
        const transcriptionText = data.number !== null 
          ? `${data.text} → ${data.number}` 
          : data.text;
        
        // Handle interim results by updating the last transcription if it's not final
        setTranscriptions(prev => {
          if (!data.isFinal && prev.length > 0 && !prev[prev.length - 1].isFinal) {
            // Update the last interim result
            const updated = [...prev];
            updated[updated.length - 1] = {
              text: transcriptionText,
              latency: totalLatency,
              timestamp: displayTime,
              isFinal: false
            };
            return updated;
          } else {
            // Add new transcription
            return [...prev, {
              text: transcriptionText,
              latency: totalLatency,
              timestamp: displayTime,
              isFinal: data.isFinal
            }];
          }
        });
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };
    
    eventSourceRef.current = eventSource;
  };

  const disconnect = () => {
    // Stop audio level monitoring
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    setIsConnected(false);
    setStatus('Disconnected');
    setAudioLevel(0);
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2>Voice Transcription Test</h2>
        <p>Status: {status}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>Audio Level:</span>
          <div style={{ 
            width: '200px', 
            height: '20px', 
            backgroundColor: '#f0f0f0', 
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${audioLevel}%`, 
              height: '100%', 
              backgroundColor: audioLevel > 70 ? '#ff4444' : audioLevel > 30 ? '#ffaa44' : '#44ff44',
              transition: 'width 0.1s ease-out'
            }} />
          </div>
          <span>{audioLevel}%</span>
        </div>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        {!isConnected ? (
          <button onClick={connectToLiveKit} style={{ fontSize: '18px', padding: '10px 20px' }}>
            Start Test
          </button>
        ) : (
          <button onClick={disconnect} style={{ fontSize: '18px', padding: '10px 20px' }}>
            Stop
          </button>
        )}
      </div>
      
      <div style={{ border: '1px solid #ccc', padding: '20px', minHeight: '200px' }}>
        <h3>Transcriptions:</h3>
        {transcriptions.length === 0 ? (
          <p>No transcriptions yet. Click Start and speak numbers.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {transcriptions.map((t, i) => (
              <li key={i} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ 
                    fontStyle: t.isFinal === false ? 'italic' : 'normal',
                    opacity: t.isFinal === false ? 0.7 : 1
                  }}>
                    {t.text}
                  </span>
                  <span style={{ 
                    color: t.latency < 500 ? 'green' : t.latency < 1000 ? 'orange' : 'red',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}>
                    {t.latency}ms {t.isFinal === false ? '(interim)' : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};