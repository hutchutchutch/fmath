import React, { useState, useEffect, useRef } from 'react';
import { Room, RoomEvent, createLocalTracks } from 'livekit-client';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';

interface VoiceInputLiveKitProps {
  onTranscript: (transcript: string, speechFinal?: boolean, timestamp?: number) => void;
  isActive: boolean;
  onConnectionChange?: (connected: boolean) => void;
}

interface TranscriptionData {
  type: 'connected' | 'transcription' | 'backend_ready';
  text?: string;
  number?: number | null;
  timestamp?: number;
  audioStartTime?: number;
  latency?: number;
  participantId?: string;
  isFinal?: boolean;
  speechFinal?: boolean;
}

const VoiceInputLiveKit: React.FC<VoiceInputLiveKitProps> = ({ onTranscript, isActive, onConnectionChange }) => {
  const [status, setStatus] = useState('Disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const roomRef = useRef<Room | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const { user } = useAuth();

  const requestMicrophonePermission = async () => {
    console.log('🎤 [Frontend] Requesting microphone permission...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ [Frontend] Microphone permission granted');
      // Stop the tracks immediately - we just wanted to check permission
      stream.getTracks().forEach(track => track.stop());
      setHasPermission(true);
      setStatus('Ready');
    } catch (error) {
      console.error('❌ [Frontend] Microphone permission denied:', error);
      setHasPermission(false);
      setStatus('Microphone access denied');
    }
  };

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
    console.log('🔄 [Frontend] Starting LiveKit connection process...');
    if (!hasPermission) {
      await requestMicrophonePermission();
      if (!hasPermission) {
        console.log('❌ [Frontend] Cannot connect - no microphone permission');
        return;
      }
    }
    
    try {
      setStatus('Connecting...');
      
      // Get token from backend
      const roomName = `test-room-${Date.now()}`;
      console.log(`🏠 [Frontend] Generated room name: ${roomName}`);
      
      console.log('🎫 [Frontend] Requesting LiveKit token from backend...');
      const response = await fetch('http://localhost:3000/voice/token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        credentials: 'include',
        body: JSON.stringify({ 
          roomName,
          participantName: user?.email || 'test-user'
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [Frontend] Token request failed:', response.status, errorText);
        throw new Error(`Failed to get LiveKit token: ${response.status} ${errorText}`);
      }
      
      const { token, url } = await response.json();
      console.log('✅ [Frontend] Received LiveKit token and URL:', { url, tokenLength: token?.length });
      
      // Create and connect to room
      const room = new Room();
      
      room.on(RoomEvent.Connected, () => {
        console.log('✅ [Frontend] Connected to LiveKit room successfully');
        console.log(`👤 [Frontend] Local participant: ${room.localParticipant.identity}`);
        setStatus('Connected');
        setIsConnected(true);
        onConnectionChange?.(true);
      });
      
      room.on(RoomEvent.Disconnected, (reason) => {
        console.log('🔌 [Frontend] Disconnected from LiveKit. Reason:', reason);
        setStatus('Disconnected');
        setIsConnected(false);
        onConnectionChange?.(false);
      });
      
      room.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log(`👥 [Frontend] Participant connected: ${participant.identity}`);
      });
      
      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        console.log(`📡 [Frontend] Track published by ${participant.identity}:`, publication.trackName);
      });
      
      console.log('🔗 [Frontend] Connecting to LiveKit room...');
      await room.connect(url, token);
      roomRef.current = room;
      console.log('✅ [Frontend] Room connected, state:', room.state);
      
      // Create and publish audio track
      console.log('🎙️ [Frontend] Creating local audio tracks...');
      const tracks = await createLocalTracks({ audio: true, video: false });
      
      if (tracks.length > 0) {
        console.log('📤 [Frontend] Publishing audio track to room...');
        const publication = await room.localParticipant.publishTrack(tracks[0]);
        console.log('✅ [Frontend] Audio track published successfully:', {
          trackSid: publication.trackSid,
          trackName: publication.trackName,
          source: publication.source
        });
        
        // Monitor audio levels
        const audioTrack = tracks[0];
        console.log('🎵 [Frontend] Audio track details:', {
          kind: audioTrack.kind,
          mediaStreamTrack: audioTrack.mediaStreamTrack
        });
        
        // Set up Web Audio API for real audio level monitoring
        if (audioTrack && audioTrack.mediaStreamTrack) {
          setupAudioLevelMonitoring(audioTrack.mediaStreamTrack);
        }
      } else {
        console.error('❌ [Frontend] No audio tracks created!');
      }
      
      // Join backend to the room
      console.log('🤖 [Frontend] Requesting backend to join room...');
      const joinResponse = await fetch('http://localhost:3000/voice/join-room', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        credentials: 'include',
        body: JSON.stringify({ roomName })
      });
      
      if (joinResponse.ok) {
        console.log('✅ [Frontend] Backend joined room successfully');
      } else {
        console.error('❌ [Frontend] Backend failed to join room:', await joinResponse.text());
      }
      
    } catch (error) {
      console.error('❌ [Frontend] Connection error:', error);
      setStatus('Connection failed');
      setIsConnected(false);
    }
  };

  const startTranscriptionMonitoring = () => {
    console.log('📻 [Frontend] Starting SSE transcription monitoring...');
    
    // Don't create a new connection if one already exists
    if (eventSourceRef.current && eventSourceRef.current.readyState !== EventSource.CLOSED) {
      console.log('⚠️ [Frontend] SSE connection already exists, skipping...');
      return;
    }
    
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    const eventSource = new EventSource('http://localhost:3000/voice/transcriptions');
    
    eventSource.onopen = () => {
      console.log('✅ [Frontend] SSE connection opened');
    };
    
    eventSource.onmessage = (event) => {
      console.log('📨 [Frontend] SSE message received:', event.data);
      const data: TranscriptionData = JSON.parse(event.data);
      
      if (data.type === 'connected') {
        console.log('✅ [Frontend] SSE connected confirmation received');
      } else if (data.type === 'backend_ready') {
        console.log('🆗 [Frontend] Backend ready signal received');
        // Backend pipeline is fully ready
      } else if (data.type === 'transcription') {
        const displayTime = Date.now();
        const totalLatency = data.audioStartTime ? displayTime - data.audioStartTime : 0;
        console.log('🎯 [Frontend] Transcription received:', {
          text: data.text,
          number: data.number,
          isFinal: data.isFinal,
          latency: data.latency,
          totalLatency,
          participantId: data.participantId
        });
        
        if (data.latency) {
          setLatency(data.latency);
        }
        
        // Handle transcription - process interim results for faster response
        // Always process transcriptions regardless of isActive state
        if (data.text) {
          // If there's a number detected, use it
          if (data.number !== null && data.number !== undefined) {
            console.log(`🔢 [Frontend] Number detected: ${data.number} (${data.isFinal ? 'final' : 'interim'}, speechFinal: ${data.speechFinal}, latency: ${data.latency}ms)`);
            onTranscript(data.number.toString(), data.speechFinal, data.timestamp || Date.now());
          } else {
            // Try to extract number from text
            const numberMatch = data.text.match(/\d+/);
            if (numberMatch) {
              console.log(`🔢 [Frontend] Number extracted from text: ${numberMatch[0]} (${data.isFinal ? 'final' : 'interim'}, speechFinal: ${data.speechFinal}, latency: ${data.latency}ms)`);
              onTranscript(numberMatch[0], data.speechFinal, data.timestamp || Date.now());
            } else {
              console.log(`❓ [Frontend] No number found in text: "${data.text}" (${data.isFinal ? 'final' : 'interim'})`);
              // Don't send non-number text to parent
            }
          }
        }
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('❌ [Frontend] SSE error:', error);
      console.error('SSE readyState:', eventSource.readyState);
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
    
    // Keep SSE connection alive - don't close it
    // if (eventSourceRef.current) {
    //   eventSourceRef.current.close();
    //   eventSourceRef.current = null;
    // }
    
    setIsConnected(false);
    setStatus('Disconnected');
    setAudioLevel(0);
    setLatency(null);
    onConnectionChange?.(false);
  };

  // Request microphone permission on mount
  useEffect(() => {
    requestMicrophonePermission();
    
    // Start SSE connection immediately on mount
    startTranscriptionMonitoring();
    
    return () => {
      // Cleanup SSE on unmount
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Auto-connect when component has permission - maintain connection throughout
  useEffect(() => {
    if (hasPermission === true && !isConnected) {
      connectToLiveKit();
    }
  }, [hasPermission]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Full cleanup including SSE
      disconnect();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="flex items-center gap-4">
        <Button
          onClick={isConnected ? disconnect : connectToLiveKit}
          variant={isConnected ? 'destructive' : 'default'}
          size="lg"
          className="flex items-center gap-2"
          disabled={hasPermission === false}
        >
          {isConnected ? (
            <>
              <MicOff className="w-5 h-5" />
              Stop Voice
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" />
              Start Voice
            </>
          )}
        </Button>
        <span className="text-sm text-gray-600">{status}</span>
      </div>
      
      {isConnected && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Audio Level:</span>
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
            <span className="text-sm text-gray-600">{audioLevel}%</span>
          </div>
          
          {latency !== null && (
            <div className="text-sm text-gray-600">
              Latency: <span className={latency < 500 ? 'text-green-600' : latency < 1000 ? 'text-orange-600' : 'text-red-600'}>
                {latency}ms
              </span>
            </div>
          )}
        </div>
      )}
      
      {hasPermission === false && (
        <div className="text-center">
          <p className="text-sm text-red-600 mb-2">Microphone access is required for voice input.</p>
          <Button
            onClick={requestMicrophonePermission}
            variant="outline"
            size="sm"
          >
            Grant Microphone Access
          </Button>
        </div>
      )}
      
      {hasPermission !== false && (
        <p className="text-xs text-gray-500 text-center max-w-xs">
          Speak the number answer clearly. Voice recognition will convert your speech to text.
        </p>
      )}
    </div>
  );
};

// Standalone microphone button component
export const MicrophoneButton: React.FC<{
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ isActive, onClick, disabled = false, className = '' }) => {
  return (
    <Button
      onClick={onClick}
      variant={isActive ? 'default' : 'outline'}
      size="sm"
      disabled={disabled}
      className={`flex items-center gap-2 ${className}`}
      title={isActive ? "Voice input is ON" : "Voice input is OFF"}
    >
      {isActive ? (
        <>
          <Mic className="w-4 h-4" />
          <span className="text-sm">Voice ON</span>
        </>
      ) : (
        <>
          <MicOff className="w-4 h-4" />
          <span className="text-sm">Voice OFF</span>
        </>
      )}
    </Button>
  );
};

export default VoiceInputLiveKit;