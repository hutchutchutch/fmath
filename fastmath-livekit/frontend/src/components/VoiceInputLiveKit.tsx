import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { Room, RoomEvent, Track, createLocalTracks, LocalAudioTrack, DataPacket_Kind, RemoteParticipant } from 'livekit-client'
import { TouchpadInput } from "./TouchpadInput"
import { DebugPanel } from "./DebugPanel"

export interface TranscriptionData {
  deepgramTranscript: string | null;
  deepgramLatency: number | null;
  deepgramStartTime: number | null;
  deepgramProblemLatency: number | null;
}

interface VoiceInputLiveKitProps {
  question: {
    num1: number;
    num2: number;
    operator: string;
    answer: number;
  };
  onAnswer: (answer: number, typingData?: { count: number; time: number; inputMethod: 'voice' | 'keyboard' }, transcriptionData?: TranscriptionData) => void;
  showFeedback: boolean;
  enableVoice?: boolean;
  onServicesReady?: (deepgramReady: boolean) => void;
}

export const VoiceInputLiveKit: React.FC<VoiceInputLiveKitProps> = ({ 
  question, 
  onAnswer, 
  showFeedback, 
  enableVoice = true,
  onServicesReady 
}) => {
  // State for inputs
  const [deepgramValue, setDeepgramValue] = useState('');
  const [deepgramInterim, setDeepgramInterim] = useState('');
  const [deepgramStatus, setDeepgramStatus] = useState('Initializing...');
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [isDeepgramReady, setIsDeepgramReady] = useState(false);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [liveKitStatus, setLiveKitStatus] = useState('Disconnected');
  
  // Refs
  const roomRef = useRef<Room | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const problemStartTimeRef = useRef<number>(Date.now());
  const speechStartTimeRef = useRef<number | null>(null);
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubmittedRef = useRef<boolean>(false);
  const transcriptionEventSourceRef = useRef<EventSource | null>(null);
  const backendParticipantRef = useRef<RemoteParticipant | null>(null);
  
  
  // Transcription data
  const transcriptionDataRef = useRef<TranscriptionData>({
    deepgramTranscript: null,
    deepgramLatency: null,
    deepgramStartTime: null,
    deepgramProblemLatency: null
  });

  // Notify parent when service is ready
  useEffect(() => {
    if (onServicesReady) {
      onServicesReady(isDeepgramReady);
    }
  }, [isDeepgramReady, onServicesReady]);

  // Reset on new question
  useEffect(() => {
    console.log('=� New question:', `${question.num1} ${question.operator} ${question.num2}`);
    setDeepgramValue('');
    setDeepgramInterim('');
    problemStartTimeRef.current = Date.now();
    hasSubmittedRef.current = false;
    
    // Reset transcription data
    speechStartTimeRef.current = null;
    transcriptionDataRef.current = {
      deepgramTranscript: null,
      deepgramLatency: null,
      deepgramStartTime: null,
      deepgramProblemLatency: null
    };
    
    if (autoSubmitTimeoutRef.current) {
      clearTimeout(autoSubmitTimeoutRef.current);
      autoSubmitTimeoutRef.current = null;
    }
  }, [question]);

  // Initialize LiveKit
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      if (!mounted || !enableVoice || useTextFallback) return;
      
      // Initialize services
      if (mounted) {
        await connectToLiveKit();
      }
    };
    
    init();
    
    return () => {
      mounted = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableVoice, useTextFallback]);

  // Connect to LiveKit
  const connectToLiveKit = async () => {
    try {
      console.log('<� Connecting to LiveKit...');
      setLiveKitStatus('Connecting...');
      
      // Get token from backend
      const roomName = `fastmath-${Date.now()}`;
      const response = await fetch('http://localhost:3001/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          roomName,
          participantName: 'fastmath-user'
        })
      });
      
      const { token, url } = await response.json();
      console.log('=� Got LiveKit token');
      
      // Create and connect to room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      
      room.on(RoomEvent.Connected, () => {
        console.log('� Connected to LiveKit room');
        setLiveKitStatus('Connected');
        
        // Start monitoring transcriptions
        startTranscriptionMonitoring();
      });
      
      room.on(RoomEvent.Disconnected, () => {
        console.log('=� Disconnected from LiveKit');
        setLiveKitStatus('Disconnected');
      });
      
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        console.log('=� Published local track:', publication.trackSid);
        setMicrophoneActive(true);
      });
      
      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacket_Kind) => {
        try {
          const decoder = new TextDecoder();
          const message = JSON.parse(decoder.decode(payload));
          console.log('=� Data received from backend:', message);
          
          if (message.type === 'transcription') {
            handleServerTranscription(message);
          }
        } catch (error) {
          console.error('Error parsing data message:', error);
        }
      });
      
      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log('=d Participant connected:', participant.identity);
        if (participant.identity === 'fastmath-backend') {
          backendParticipantRef.current = participant;
          console.log('<� Backend participant connected');
        }
      });
      
      await room.connect(url, token);
      roomRef.current = room;
      
      // Create and publish audio track first
      const tracks = await createLocalTracks({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      
      if (tracks.length > 0 && tracks[0].kind === Track.Kind.Audio) {
        audioTrackRef.current = tracks[0] as LocalAudioTrack;
        
        // Publish the audio track to LiveKit room
        await room.localParticipant.publishTrack(tracks[0]);
        console.log('🎵 Published audio track to LiveKit room');
        setMicrophoneActive(true);
        setIsListening(true);
      }
      
      // Now join backend services to the room (this will make backend join and listen)
      await fetch('http://localhost:3001/api/livekit/join-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName })
      });
      
      console.log('🏠 Backend joined LiveKit room and connected to Deepgram');
      
      setIsDeepgramReady(true);
      setDeepgramStatus('Connected via LiveKit');
      
    } catch (error) {
      console.error('L Failed to connect to LiveKit:', error);
      setLiveKitStatus('Connection failed');
      setDeepgramStatus('LiveKit connection failed');
    }
  };

  // Start monitoring server transcriptions
  const startTranscriptionMonitoring = () => {
    console.log('=� Starting SSE transcription monitoring...');
    
    if (transcriptionEventSourceRef.current) {
      console.log('=� Closing existing SSE connection');
      transcriptionEventSourceRef.current.close();
    }
    
    const eventSource = new EventSource('http://localhost:3001/api/livekit/transcriptions');
    
    eventSource.onopen = () => {
      console.log('� SSE connection opened for transcriptions');
    };
    
    eventSource.onmessage = (event) => {
      console.log('=� SSE message received:', event.data);
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          console.log('� SSE connected to transcription stream');
        } else if (data.type === 'transcription') {
          console.log('=� Transcription from server:', data);
          handleServerTranscription(data);
        } else {
          console.log('=� Other SSE message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing transcription:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('L SSE error:', error);
      console.log('SSE readyState:', eventSource.readyState);
      // Retry connection after error
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('=� SSE closed, will retry in 2 seconds...');
        setTimeout(() => {
          if (transcriptionEventSourceRef.current === eventSource) {
            startTranscriptionMonitoring();
          }
        }, 2000);
      }
    };
    
    transcriptionEventSourceRef.current = eventSource;
  };


  // Handle transcriptions from server
  const handleServerTranscription = (data: any) => {
    const { service, text, latency, number, roomName, participantId } = data;
    
    console.log(`=� ${service.toUpperCase()} transcription:`, {
      text,
      number,
      latency,
      roomName,
      participantId
    });
    
    // Set shared speech start time if not already set
    if (!speechStartTimeRef.current && latency) {
      const estimatedStart = Date.now() - latency;
      speechStartTimeRef.current = estimatedStart;
      console.log('<� Set speech start time from server:', estimatedStart);
    }
    
    if (service === 'deepgram') {
      console.log('=👀 Processing Deepgram transcription');
      if (number !== null) {
        const now = Date.now();
        transcriptionDataRef.current.deepgramTranscript = number.toString();
        transcriptionDataRef.current.deepgramStartTime = now;
        transcriptionDataRef.current.deepgramLatency = latency;
        transcriptionDataRef.current.deepgramProblemLatency = now - problemStartTimeRef.current;
        
        setDeepgramValue(number.toString());
        setDeepgramInterim('');
        setDeepgramStatus(`Heard: ${number}`);
        console.log('✅ Deepgram value set:', number);
      } else if (text) {
        // Show interim result
        setDeepgramInterim(text);
        console.log('=📃 Deepgram interim:', text);
      }
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        setShowDebug(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Check if we should auto-submit
  const checkAutoSubmit = useCallback(() => {
    if (showFeedback || hasSubmittedRef.current) return;
    
    const hasDeepgram = deepgramValue !== '';
    
    console.log('==> Input status - Deepgram:', deepgramValue);
    
    // If Deepgram has a value, submit immediately
    if (hasDeepgram) {
      console.log('✅ Deepgram has value, submitting...');
      submitAnswer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepgramValue, showFeedback]);

  useEffect(() => {
    checkAutoSubmit();
  }, [checkAutoSubmit]);

  const submitAnswer = () => {
    if (hasSubmittedRef.current || showFeedback) return;
    
    const finalAnswer = deepgramValue || '';
    const numValue = parseInt(finalAnswer);
    
    if (!isNaN(numValue)) {
      console.log('=� Submitting answer:', numValue);
      console.log('=� Transcription data at submission:', transcriptionDataRef.current);
      hasSubmittedRef.current = true;
      
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current);
        autoSubmitTimeoutRef.current = null;
      }
      
      onAnswer(numValue, {
        count: 1,
        time: 0,
        inputMethod: 'voice' as const
      }, transcriptionDataRef.current);
    }
  };

  const cleanup = () => {
    console.log('>� Cleaning up voice recognition...');
    
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    
    if (transcriptionEventSourceRef.current) {
      transcriptionEventSourceRef.current.close();
      transcriptionEventSourceRef.current = null;
    }
    
    if (autoSubmitTimeoutRef.current) {
      clearTimeout(autoSubmitTimeoutRef.current);
      autoSubmitTimeoutRef.current = null;
    }
    
    
    setIsListening(false);
    setIsDeepgramReady(false);
    setDeepgramStatus('Stopped');
    setLiveKitStatus('Disconnected');
  };

  const handleManualInput = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    setDeepgramValue(numericValue);
    
    if (numericValue.length === question.answer.toString().length) {
      const numValue = parseInt(numericValue);
      if (!isNaN(numValue)) {
        onAnswer(numValue, {
          count: 1,
          time: 0,
          inputMethod: 'keyboard' as const
        });
      }
    }
  };

  const handleStop = () => {
    console.log('=🛑 Stop button clicked');
    cleanup();
  };

  const handleStart = async () => {
    console.log('▶️ Start button clicked');
    
    // This ensures we have user interaction for AudioContext
    try {
      // Test microphone access first
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testStream.getTracks().forEach(track => track.stop());
      console.log('✅ Microphone access granted');
      
      setIsListening(true);
      await connectToLiveKit();
    } catch (error) {
      console.error('❌ Microphone access denied:', error);
      alert('Please allow microphone access to use voice input');
    }
  };

  const getInputClassName = (isCorrect?: boolean, hasValue?: boolean) => {
    const baseClasses = `
      w-full 
      p-4 
      text-3xl 
      font-bold 
      text-center 
      rounded-lg
      border-4
      outline-none
      transition-all
      duration-200
      min-h-[80px]
      flex
      items-center
      justify-center
    `;
    
    if (showFeedback && isCorrect !== undefined) {
      return `${baseClasses} ${isCorrect
        ? 'border-green-500 bg-green-50 text-green-700'
        : 'border-red-500 bg-red-50 text-red-700'
      }`;
    }
    
    if (hasValue) {
      return `${baseClasses} border-blue-400 bg-blue-50 text-gray-700`;
    }
    
    return `${baseClasses} border-gray-200 bg-white text-gray-700`;
  };

  return (
    <div className="space-y-6">
      {/* Question Display */}
      <div className="text-center">
        <p className="text-6xl font-bold text-gray-800">
          {question.num1} {question.operator} {question.num2} = ?
        </p>
      </div>

      {/* LiveKit Connection Status */}
      <div className="flex justify-center items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${
          liveKitStatus === 'Connected' ? 'bg-green-500' : 
          liveKitStatus === 'Connecting...' ? 'bg-yellow-500 animate-pulse' : 
          'bg-gray-300'
        }`} />
        <span className="text-sm text-gray-600">LiveKit: {liveKitStatus}</span>
      </div>

      {/* Controls */}
      {!useTextFallback && (
        <div className="space-y-4">
          {/* Microphone Activity Indicator */}
          <div className="flex justify-center items-center space-x-2">
            <div className={`w-4 h-4 rounded-full transition-all ${
              microphoneActive ? 'bg-red-500 animate-pulse' : 'bg-gray-300'
            }`} />
            <span className="text-sm text-gray-600">
              {microphoneActive ? 'Microphone active' : 'Microphone idle'}
            </span>
          </div>
          
          {/* Control Buttons */}
          <div className="flex justify-center items-center space-x-4">
            {/* Start/Stop Button */}
            {isListening ? (
              <button
                onClick={handleStop}
                className="px-4 py-2 rounded-lg font-medium transition-colors bg-red-500 hover:bg-red-600 text-white"
              >
                =🛑 Stop
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="px-4 py-2 rounded-lg font-medium transition-colors bg-green-500 hover:bg-green-600 text-white"
              >
                ▶️ Start
              </button>
            )}
          </div>
        </div>
      )}

      {/* Voice Input Display */}
      {!useTextFallback ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-purple-600">Deepgram</h3>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                isDeepgramReady ? 'bg-green-500' : 'bg-gray-300'
              }`} />
              <span className="text-sm text-gray-500">{deepgramStatus}</span>
            </div>
          </div>
          <div className={getInputClassName(showFeedback && deepgramValue === question.answer.toString(), !!deepgramValue)}>
            {deepgramValue ? (
              <span>{deepgramValue}</span>
            ) : deepgramInterim ? (
              <span className="text-gray-500 italic">{deepgramInterim}</span>
            ) : (
              isDeepgramReady ? (
                <span className="text-gray-400">Listening for speech...</span>
              ) : (
                <span className="text-gray-400">Connecting...</span>
              )
            )}
          </div>
        </div>
      ) : (
        <div className="flex justify-between">
          <div className="flex-1 max-w-md mx-auto">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              value={deepgramValue}
              onChange={(e) => handleManualInput(e.target.value)}
              disabled={showFeedback}
              placeholder="Type your answer"
              className={getInputClassName(undefined, !!deepgramValue)}
              autoFocus
            />
          </div>
          <TouchpadInput
            value={deepgramValue}
            onChange={handleManualInput}
            disabled={showFeedback}
            showFeedback={showFeedback}
            wasCorrect={parseInt(deepgramValue) === question.answer}
          />
        </div>
      )}

      {/* Status Messages */}
      <div className="text-center text-sm text-gray-600">
        {!useTextFallback ? (
          <div>
            <p>Say your answer clearly</p>
            <p className="text-xs mt-1 text-blue-600">Using Deepgram speech recognition</p>
            {deepgramValue && !showFeedback && (
              <p className="text-yellow-600 mt-1">
                Processing your answer...
              </p>
            )}
            {!isDeepgramReady && (
              <p className="text-orange-600 mt-1">
                Waiting for service to connect...
              </p>
            )}
          </div>
        ) : (
          <div>
            <p>Voice input unavailable - type your answer</p>
            <button
              onClick={() => {
                setUseTextFallback(false);
              }}
              className="text-blue-600 hover:underline mt-2"
            >
              Try voice again
            </button>
          </div>
        )}
      </div>

      {/* Show correct answer if wrong */}
      {showFeedback && deepgramValue !== question.answer.toString() && (
        <div className="text-center">
          <p className="text-2xl text-green-600 font-bold">
            Correct answer: {question.answer}
          </p>
        </div>
      )}

      {/* Debug Panel */}
      <DebugPanel
        show={showDebug}
        deepgramStatus={deepgramStatus}
        deepgramValue={deepgramValue}
        latencies={{
          deepgram: transcriptionDataRef.current.deepgramLatency,
          deepgramProblem: transcriptionDataRef.current.deepgramProblemLatency
        }}
        problemStartTime={problemStartTimeRef.current}
      />
    </div>
  );
};