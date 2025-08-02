import { useState, useCallback, useRef, useEffect } from 'react';
import { Room, RemoteTrack, LocalTrack, createLocalTracks, Track } from 'livekit-client';
import { VoiceInputConfig, TranscriptionData, AudioLevelData } from '../types/voice';
import { createVoiceSession, getVoiceToken, joinVoiceRoom, endVoiceSession } from '../config/api';
import { logError } from '../utils/errorReporting';

export const useVoiceInput = (config: VoiceInputConfig) => {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const roomRef = useRef<Room | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);

  // Setup audio level monitoring
  const setupAudioMonitoring = useCallback(async (track: MediaStreamTrack) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const stream = new MediaStream([track]);
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      source.connect(analyserRef.current);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average level
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / dataArray.length;
        const normalizedLevel = Math.min(100, Math.floor((avg / 255) * 200));
        
        setAudioLevel(normalizedLevel);
        config.onAudioLevel?.(normalizedLevel);
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (error) {
      console.error('[useVoiceInput] Audio monitoring setup failed:', error);
    }
  }, [config]);

  // Setup SSE for transcriptions
  const setupTranscriptionStream = useCallback((sessionId: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const eventSource = new EventSource(
      `${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/voice/transcriptions/${sessionId}`,
      {
        withCredentials: true
      }
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'transcription') {
          const transcription = data.data as TranscriptionData;
          setTranscript(transcription.text);
          setLatency(transcription.latency);
          config.onTranscription(transcription.text, transcription.isFinal);
        } else if (data.type === 'audioLevel') {
          const levelData = data.data as AudioLevelData;
          setAudioLevel(levelData.level);
          config.onAudioLevel?.(levelData.level);
        }
      } catch (error) {
        console.error('[useVoiceInput] Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[useVoiceInput] SSE error:', error);
      setError(new Error('Transcription stream error'));
      config.onError?.(new Error('Transcription stream error'));
    };

    eventSourceRef.current = eventSource;
  }, [config]);

  const startVoiceInput = useCallback(async () => {
    try {
      setError(null);
      setIsListening(true);
      
      // Get user ID from token
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userId = payload.userId;
      const trackId = sessionStorage.getItem('activeTrackId') || 'TRACK1';

      // Create voice session
      const sessionResponse = await createVoiceSession(userId, trackId);
      if (!sessionResponse.success || !sessionResponse.sessionId || !sessionResponse.roomName) {
        throw new Error('Failed to create voice session');
      }

      sessionIdRef.current = sessionResponse.sessionId;
      const roomName = sessionResponse.roomName;

      // Setup transcription stream
      setupTranscriptionStream(sessionResponse.sessionId);

      // Get LiveKit token
      const tokenResponse = await getVoiceToken(roomName, `user-${userId}`);
      if (!tokenResponse.success || !tokenResponse.token || !tokenResponse.url) {
        throw new Error('Failed to get voice token');
      }

      // Create and connect to LiveKit room
      const room = new Room();
      roomRef.current = room;

      // Connect to room
      await room.connect(tokenResponse.url, tokenResponse.token);

      // Create local audio track
      const tracks = await createLocalTracks({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localTracksRef.current = tracks;

      // Publish audio track
      const audioTrack = tracks.find(track => track.kind === Track.Kind.Audio);
      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack);
        
        // Setup local audio monitoring
        const mediaTrack = audioTrack.mediaStreamTrack;
        if (mediaTrack) {
          await setupAudioMonitoring(mediaTrack);
        }
      }

      // Have backend join the room to process audio
      await joinVoiceRoom(roomName, userId);

    } catch (error) {
      console.error('[useVoiceInput] Failed to start voice input:', error);
      setIsListening(false);
      setError(error instanceof Error ? error : new Error('Failed to start voice input'));
      config.onError?.(error instanceof Error ? error : new Error('Failed to start voice input'));
      
      // Log to Sentry
      logError(error, {
        component: 'useVoiceInput',
        action: 'startVoiceInput'
      });
    }
  }, [config, setupTranscriptionStream, setupAudioMonitoring]);

  const stopVoiceInput = useCallback(async () => {
    try {
      setIsListening(false);

      // Stop audio level animation
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
      }

      // Stop local tracks
      localTracksRef.current.forEach(track => track.stop());
      localTracksRef.current = [];

      // Disconnect from room
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }

      // Close SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // End voice session
      if (sessionIdRef.current) {
        await endVoiceSession(sessionIdRef.current);
        sessionIdRef.current = null;
      }

      // Reset state
      setAudioLevel(0);
      setTranscript('');
      setLatency(null);

    } catch (error) {
      console.error('[useVoiceInput] Failed to stop voice input:', error);
      setError(error instanceof Error ? error : new Error('Failed to stop voice input'));
      config.onError?.(error instanceof Error ? error : new Error('Failed to stop voice input'));
    }
  }, [config]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isListening) {
        stopVoiceInput();
      }
    };
  }, [isListening, stopVoiceInput]);

  return {
    isListening,
    audioLevel,
    transcript,
    latency,
    error,
    startVoiceInput,
    stopVoiceInput
  };
};