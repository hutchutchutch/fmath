import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { TouchpadInput } from "./TouchpadInput"
import { DebugPanel } from "./DebugPanel"

// Web Speech API types (same as before)
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: any;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  serviceURI: string;
  start(): void;
  stop(): void;
  abort(): void;
  onaudiostart: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onaudioend: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: ISpeechRecognition, ev: ISpeechRecognitionErrorEvent) => any) | null;
  onnomatch: ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => any) | null;
  onresult: ((this: ISpeechRecognition, ev: ISpeechRecognitionEvent) => any) | null;
  onsoundstart: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onsoundend: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: ISpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: ISpeechRecognition, ev: Event) => any) | null;
}

interface ISpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
      isFinal: boolean;
      length: number;
    };
  };
}

interface ISpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: ISpeechRecognitionConstructor;
    webkitSpeechRecognition?: ISpeechRecognitionConstructor;
  }
}

export interface TranscriptionData {
  webSpeechTranscript: string | null;
  deepgramTranscript: string | null;
  groqTranscript: string | null;
  webSpeechLatency: number | null;
  deepgramLatency: number | null;
  groqLatency: number | null;
  webSpeechStartTime: number | null;
  deepgramStartTime: number | null;
  groqStartTime: number | null;
  webSpeechProblemLatency: number | null;
  deepgramProblemLatency: number | null;
  groqProblemLatency: number | null;
}

interface TripleVoiceInputDirectProps {
  question: {
    num1: number;
    num2: number;
    operator: string;
    answer: number;
  };
  onAnswer: (answer: number, typingData?: { count: number; time: number; inputMethod: 'voice' | 'keyboard' }, transcriptionData?: TranscriptionData) => void;
  showFeedback: boolean;
  enableVoice?: boolean;
  onServicesReady?: (webSpeechReady: boolean, deepgramReady: boolean, groqReady: boolean) => void;
}

export const TripleVoiceInputDirect: React.FC<TripleVoiceInputDirectProps> = ({ 
  question, 
  onAnswer, 
  showFeedback, 
  enableVoice = true,
  onServicesReady 
}) => {
  // State for all three inputs
  const [webSpeechValue, setWebSpeechValue] = useState('');
  const [deepgramValue, setDeepgramValue] = useState('');
  const [groqValue, setGroqValue] = useState('');
  const [webSpeechInterim, setWebSpeechInterim] = useState('');
  const [deepgramInterim, setDeepgramInterim] = useState('');
  const [groqInterim, setGroqInterim] = useState('');
  const [webSpeechStatus, setWebSpeechStatus] = useState('Initializing...');
  const [deepgramStatus, setDeepgramStatus] = useState('Initializing...');
  const [groqStatus, setGroqStatus] = useState('Initializing...');
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [isWebSpeechReady, setIsWebSpeechReady] = useState(false);
  const [isDeepgramReady, setIsDeepgramReady] = useState(false);
  const [isGroqReady, setIsGroqReady] = useState(false);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [webSpeechEnabled, setWebSpeechEnabled] = useState(true);
  const [deepgramEnabled, setDeepgramEnabled] = useState(true);
  const [groqEnabled, setGroqEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [roomName] = useState(`fastmath-${Date.now()}`);
  
  // Refs
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioWebSocketRef = useRef<WebSocket | null>(null);
  const transcriptionEventSourceRef = useRef<EventSource | null>(null);
  const problemStartTimeRef = useRef<number>(Date.now());
  const sharedSpeechStartTimeRef = useRef<number | null>(null);
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubmittedRef = useRef<boolean>(false);
  const micCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  
  // Transcription data
  const transcriptionDataRef = useRef<TranscriptionData>({
    webSpeechTranscript: null,
    deepgramTranscript: null,
    groqTranscript: null,
    webSpeechLatency: null,
    deepgramLatency: null,
    groqLatency: null,
    webSpeechStartTime: null,
    deepgramStartTime: null,
    groqStartTime: null,
    webSpeechProblemLatency: null,
    deepgramProblemLatency: null,
    groqProblemLatency: null
  });

  // Notify parent when services are ready
  useEffect(() => {
    if (onServicesReady) {
      onServicesReady(isWebSpeechReady, isDeepgramReady, isGroqReady);
    }
  }, [isWebSpeechReady, isDeepgramReady, isGroqReady, onServicesReady]);

  // Reset on new question
  useEffect(() => {
    console.log('🔄 New question:', `${question.num1} ${question.operator} ${question.num2}`);
    setWebSpeechValue('');
    setDeepgramValue('');
    setGroqValue('');
    setWebSpeechInterim('');
    setDeepgramInterim('');
    setGroqInterim('');
    problemStartTimeRef.current = Date.now();
    hasSubmittedRef.current = false;
    
    // Reset transcription data
    sharedSpeechStartTimeRef.current = null;
    transcriptionDataRef.current = {
      webSpeechTranscript: null,
      deepgramTranscript: null,
      groqTranscript: null,
      webSpeechLatency: null,
      deepgramLatency: null,
      groqLatency: null,
      webSpeechStartTime: null,
      deepgramStartTime: null,
      groqStartTime: null,
      webSpeechProblemLatency: null,
      deepgramProblemLatency: null,
      groqProblemLatency: null
    };
    
    if (autoSubmitTimeoutRef.current) {
      clearTimeout(autoSubmitTimeoutRef.current);
      autoSubmitTimeoutRef.current = null;
    }
  }, [question]);

  // Initialize voice recognition
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      if (!mounted || !enableVoice || useTextFallback) return;
      
      try {
        // Request microphone permission
        console.log('🎤 Requesting microphone permission...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000
          } 
        });
        
        console.log('✅ Microphone permission granted');
        
        if (!mounted) return;
        
        mediaStreamRef.current = stream;
        setupMicrophoneMonitoring(stream);
        
        // Initialize services
        setIsListening(true);
        if (webSpeechEnabled) {
          initializeWebSpeech();
        }
        if (deepgramEnabled || groqEnabled) {
          await initializeAudioStreaming();
          startTranscriptionMonitoring();
        }
      } catch (error) {
        console.error('❌ Microphone permission denied:', error);
        if (mounted) {
          setWebSpeechStatus('Mic permission denied');
          setDeepgramStatus('Mic permission denied');
          setGroqStatus('Mic permission denied');
          setUseTextFallback(true);
        }
      }
    };
    
    init();
    
    return () => {
      mounted = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableVoice, useTextFallback]);

  // Initialize audio streaming
  const initializeAudioStreaming = async () => {
    try {
      console.log('🎥 Initializing audio streaming...');
      
      // Connect to audio stream WebSocket
      const wsUrl = `ws://localhost:3001/ws/audio-stream?room=${roomName}&participant=user`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('✅ Connected to audio stream WebSocket');
        setDeepgramStatus('Connected');
        setGroqStatus('Connected');
        setIsDeepgramReady(true);
        setIsGroqReady(true);
        
        // Start sending audio
        setupAudioCapture();
      };
      
      ws.onerror = (error) => {
        console.error('❌ Audio stream WebSocket error:', error);
        setDeepgramStatus('Connection failed');
        setGroqStatus('Connection failed');
      };
      
      ws.onclose = () => {
        console.log('🔌 Audio stream WebSocket closed');
        setDeepgramStatus('Disconnected');
        setGroqStatus('Disconnected');
        setIsDeepgramReady(false);
        setIsGroqReady(false);
      };
      
      audioWebSocketRef.current = ws;
      
      // Join backend services to process audio
      await fetch('http://localhost:3001/api/livekit/join-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName })
      });
      
      console.log('🎯 Backend services initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize audio streaming:', error);
      setDeepgramStatus('Failed to connect');
      setGroqStatus('Failed to connect');
    }
  };

  // Setup audio capture and streaming
  const setupAudioCapture = () => {
    if (!mediaStreamRef.current || !audioWebSocketRef.current) return;
    
    console.log('🎤 Setting up audio capture...');
    
    try {
      // For raw PCM streaming to Deepgram
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
      
      // Create a script processor for capturing audio
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (audioWebSocketRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert float32 to int16
          const buffer = new ArrayBuffer(inputData.length * 2);
          const view = new DataView(buffer);
          
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          }
          
          // Send audio data
          audioWebSocketRef.current.send(buffer);
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      audioContextRef.current = audioContext;
      processorRef.current = processor;
      
      // Also setup MediaRecorder for Groq (needs WebM format)
      setupMediaRecorderForGroq();
      
      console.log('✅ Audio capture started');
    } catch (error) {
      console.error('❌ Failed to setup audio capture:', error);
    }
  };
  
  // Setup MediaRecorder for Groq
  const setupMediaRecorderForGroq = () => {
    if (!mediaStreamRef.current) return;
    
    try {
      const mediaRecorder = new MediaRecorder(mediaStreamRef.current, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      const chunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        console.log(`📦 MediaRecorder stopped, chunks collected: ${chunks.length}`);
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
          const buffer = await blob.arrayBuffer();
          console.log(`🎵 WebM blob size: ${blob.size} bytes, buffer size: ${buffer.byteLength} bytes`);
          
          // Send WebM audio for Groq processing
          if (audioWebSocketRef.current?.readyState === WebSocket.OPEN) {
            // Send with a marker to indicate it's WebM format
            const marker = new TextEncoder().encode('WEBM:');
            const combined = new Uint8Array(marker.length + buffer.byteLength);
            combined.set(marker, 0);
            combined.set(new Uint8Array(buffer), marker.length);
            console.log(`📤 Sending WebM data to backend: ${combined.length} bytes`);
            audioWebSocketRef.current.send(combined);
          } else {
            console.log('⚠️ WebSocket not open, cannot send WebM data');
          }
        }
        chunks.length = 0;
      };
      
      // Store MediaRecorder reference
      mediaRecorderRef.current = mediaRecorder;
      
      // Record in 3-second chunks for Groq
      const recordChunks = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
          console.log('🎬 Starting MediaRecorder recording...');
          mediaRecorderRef.current.start();
          setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              console.log('🛑 Stopping MediaRecorder recording...');
              mediaRecorderRef.current.stop();
              setTimeout(recordChunks, 100); // Small gap between recordings
            }
          }, 3000);
        }
      };
      
      recordChunks();
      console.log('📹 MediaRecorder setup complete for Groq');
    } catch (error) {
      console.error('❌ Failed to setup MediaRecorder:', error);
    }
  };

  // Start monitoring server transcriptions
  const startTranscriptionMonitoring = () => {
    console.log('📡 Starting SSE transcription monitoring...');
    
    if (transcriptionEventSourceRef.current) {
      console.log('🔄 Closing existing SSE connection');
      transcriptionEventSourceRef.current.close();
    }
    
    const eventSource = new EventSource('http://localhost:3001/api/livekit/transcriptions');
    
    eventSource.onopen = () => {
      console.log('✅ SSE connection opened for transcriptions');
    };
    
    eventSource.onmessage = (event) => {
      console.log('📨 SSE message received:', event.data);
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          console.log('✅ SSE connected to transcription stream');
        } else if (data.type === 'transcription') {
          console.log('📝 Transcription from server:', data);
          handleServerTranscription(data);
        } else {
          console.log('📦 Other SSE message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing transcription:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('❌ SSE error:', error);
      console.log('SSE readyState:', eventSource.readyState);
      // Retry connection after error
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('🔄 SSE closed, will retry in 2 seconds...');
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
    const { service, text, latency, number, roomName: dataRoom, participantId } = data;
    
    // Only process transcriptions for our room
    if (dataRoom !== roomName) {
      console.log(`📤 Ignoring transcription for different room: ${dataRoom}`);
      return;
    }
    
    console.log(`📝 ${service.toUpperCase()} transcription:`, {
      text,
      number,
      latency,
      roomName: dataRoom,
      participantId,
      enabledStates: { deepgramEnabled, groqEnabled }
    });
    
    // Set shared speech start time if not already set
    if (!sharedSpeechStartTimeRef.current && latency) {
      const estimatedStart = Date.now() - latency;
      sharedSpeechStartTimeRef.current = estimatedStart;
      console.log('🎤 Set shared speech start time from server:', estimatedStart);
    }
    
    if (service === 'deepgram' && deepgramEnabled) {
      console.log('🟣 Processing Deepgram transcription');
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
        console.log('📝 Deepgram interim:', text);
      }
    } else if (service === 'groq' && groqEnabled) {
      console.log('🟠 Processing Groq transcription');
      if (number !== null) {
        const now = Date.now();
        transcriptionDataRef.current.groqTranscript = number.toString();
        transcriptionDataRef.current.groqStartTime = now;
        transcriptionDataRef.current.groqLatency = latency;
        transcriptionDataRef.current.groqProblemLatency = now - problemStartTimeRef.current;
        
        setGroqValue(number.toString());
        setGroqInterim('');
        setGroqStatus(`Heard: ${number}`);
        console.log('✅ Groq value set:', number);
      } else if (text) {
        // Show interim result
        setGroqInterim(text);
        console.log('📝 Groq interim:', text);
      }
    } else {
      console.log(`⚠️ Service ${service} transcription ignored - service not enabled or unknown`);
    }
  };

  // Setup microphone activity monitoring
  const setupMicrophoneMonitoring = (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      source.connect(analyser);
      analyser.fftSize = 256;
      
      analyserRef.current = analyser;
      
      // Check microphone activity
      const checkMicActivity = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setMicrophoneActive(average > 10); // Threshold for activity
      };
      
      micCheckIntervalRef.current = setInterval(checkMicActivity, 100);
      console.log('🎙️ Microphone monitoring started');
    } catch (error) {
      console.error('Failed to setup microphone monitoring:', error);
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
    
    const hasWebSpeech = webSpeechValue !== '';
    const hasDeepgram = deepgramValue !== '';
    const hasGroq = groqValue !== '';
    
    const enabledCount = [webSpeechEnabled, deepgramEnabled, groqEnabled].filter(Boolean).length;
    const valueCount = [hasWebSpeech, hasDeepgram, hasGroq].filter(Boolean).length;
    
    console.log('📊 Input status - Web Speech:', webSpeechValue, 'Deepgram:', deepgramValue, 'Groq:', groqValue);
    console.log('🔧 Enabled services:', enabledCount, 'Values received:', valueCount);
    
    // If only one service is enabled and has a value, submit immediately
    if (enabledCount === 1 && valueCount === 1) {
      console.log('✅ Single service has value, submitting...');
      submitAnswer();
    }
    // If all enabled services have values, submit immediately
    else if (valueCount === enabledCount && valueCount > 0) {
      console.log('✅ All enabled services have values, submitting...');
      submitAnswer();
    }
    // If at least one has value, start timer
    else if (valueCount > 0 && !autoSubmitTimeoutRef.current) {
      console.log('⏰ Starting 5-second timer for auto-submit...');
      autoSubmitTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Timer expired, submitting with available data...');
        submitAnswer();
      }, 5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSpeechValue, deepgramValue, groqValue, showFeedback, webSpeechEnabled, deepgramEnabled, groqEnabled]);

  useEffect(() => {
    checkAutoSubmit();
  }, [checkAutoSubmit]);

  const initializeWebSpeech = () => {
    try {
      if (recognitionRef.current) {
        console.log('⚠️ Web Speech already initialized');
        return;
      }
      
      console.log('🎤 Initializing Web Speech API...');
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.error('❌ Web Speech API not supported');
        setWebSpeechStatus('Not supported');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('✅ Web Speech API started');
        setWebSpeechStatus('Listening...');
        setIsWebSpeechReady(true);
      };

      recognition.onspeechstart = () => {
        const now = Date.now();
        const timeSinceProblem = now - problemStartTimeRef.current;
        console.log('🗣️ Web Speech: Speech started at', timeSinceProblem, 'ms after problem shown');
        
        if (!sharedSpeechStartTimeRef.current) {
          sharedSpeechStartTimeRef.current = now;
          console.log('🎤 Set shared speech start time:', now);
        }
        
        if (!transcriptionDataRef.current.webSpeechStartTime) {
          transcriptionDataRef.current.webSpeechStartTime = now;
          console.log('📍 Set webSpeechStartTime:', now);
        }
      };

      recognition.onresult = (event: ISpeechRecognitionEvent) => {
        console.log('📝 Web Speech result event:', event);
        const results = event.results;
        
        for (let i = event.resultIndex; i < results.length; i++) {
          const result = results[i];
          if (result.length > 0) {
            const transcript = result[0].transcript.trim();
            const confidence = result[0].confidence;
            console.log(`🗣️ Web Speech transcript:`, transcript, 'Confidence:', confidence, 'Final:', result.isFinal);
            
            if (!result.isFinal) {
              const interimNumber = extractNumberFromSpeech(transcript);
              if (interimNumber !== null) {
                setWebSpeechInterim(interimNumber.toString());
              } else {
                setWebSpeechInterim('');
              }
            }
            
            for (let j = 0; j < result.length; j++) {
              const altTranscript = result[j].transcript.trim();
              const number = extractNumberFromSpeech(altTranscript);
              
              if (number !== null && result.isFinal) {
                const now = Date.now();
                
                if (!transcriptionDataRef.current.webSpeechStartTime) {
                  if (sharedSpeechStartTimeRef.current) {
                    transcriptionDataRef.current.webSpeechStartTime = sharedSpeechStartTimeRef.current;
                    console.log('📍 Using shared speech start time for Web Speech:', sharedSpeechStartTimeRef.current);
                  } else {
                    const estimatedStart = now - 500;
                    transcriptionDataRef.current.webSpeechStartTime = estimatedStart;
                    sharedSpeechStartTimeRef.current = estimatedStart;
                    console.log('⚠️ Web Speech start time not set by onspeechstart, estimating:', estimatedStart);
                  }
                }
                
                if (transcriptionDataRef.current.webSpeechStartTime) {
                  transcriptionDataRef.current.webSpeechLatency = now - transcriptionDataRef.current.webSpeechStartTime;
                  console.log('⏱️ Web Speech latency (from speech start):', transcriptionDataRef.current.webSpeechLatency, 'ms');
                }
                
                transcriptionDataRef.current.webSpeechProblemLatency = now - problemStartTimeRef.current;
                console.log('⏱️ Web Speech latency (from problem display):', transcriptionDataRef.current.webSpeechProblemLatency, 'ms');
                
                transcriptionDataRef.current.webSpeechTranscript = number.toString();
                setWebSpeechValue(number.toString());
                setWebSpeechInterim('');
                setWebSpeechStatus(`Heard: ${number}`);
                console.log('✅ Web Speech captured number:', number);
                console.log('📊 Updated transcriptionData:', transcriptionDataRef.current);
                break;
              }
            }
          }
        }
      };

      recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
        console.error('❌ Web Speech error:', event.error, event.message);
        setWebSpeechStatus(`Error: ${event.error}`);
        
        if (event.error === 'no-speech') {
          return;
        }
        
        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
          setUseTextFallback(true);
          setIsWebSpeechReady(false);
        }
        
        if (event.error === 'aborted') {
          console.log('🛑 Recognition aborted - not restarting');
        }
      };

      recognition.onend = () => {
        console.log('🔚 Web Speech ended');
        setIsWebSpeechReady(false);
        
        if (!useTextFallback && !showFeedback && enableVoice && recognitionRef.current === recognition) {
          setTimeout(() => {
            try {
              if (recognitionRef.current === recognition && !showFeedback) {
                console.log('🔄 Restarting Web Speech...');
                recognition.start();
              }
            } catch (error) {
              console.error('Failed to restart Web Speech:', error);
            }
          }, 1000);
        }
      };

      recognitionRef.current = recognition;
      
      if (!showFeedback) {
        try {
          recognition.start();
          console.log('🚀 Web Speech recognition.start() called');
        } catch (error) {
          console.error('Failed to start Web Speech:', error);
          setWebSpeechStatus('Failed to start');
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize Web Speech:', error);
      setWebSpeechStatus('Failed to initialize');
    }
  };

  const extractNumberFromSpeech = (transcript: string): number | null => {
    const cleanTranscript = transcript.toLowerCase().trim();
    console.log('🔍 Extracting number from:', cleanTranscript);
    
    // Sound-alike replacements
    const soundAlikeReplacements: { [key: string]: string } = {
      'won': '1', 'one': '1', 'juan': '1', 'wan': '1',
      'to': '2', 'too': '2', 'two': '2', 'tu': '2',
      'tree': '3', 'three': '3', 'free': '3', 'thee': '3',
      'for': '4', 'four': '4', 'fore': '4', 'floor': '4', 'far': '4',
      'five': '5', 'fife': '5', 'hive': '5',
      'six': '6', 'sex': '6', 'sax': '6', 'sics': '6', 'siks': '6',
      'seven': '7', 'heaven': '7',
      'ate': '8', 'eight': '8', 'hate': '8', 'eat': '8',
      'nine': '9', 'nein': '9', 'none': '9', 'nun': '9', 'mine': '9',
      'ten': '10', 'tan': '10', 'tin': '10', 'pen': '10',
      'eleven': '11', 'leaven': '11',
      'twelve': '12', 'shelf': '12',
      'thirteen': '13', 'hurting': '13', 'thirting': '13',
      'fourteen': '14', 'forteen': '14', 'fourting': '14',
      'fifteen': '15', 'fifting': '15',
      'sixteen': '16', 'sixting': '16',
      'seventeen': '17', 'seventing': '17',
      'eighteen': '18', 'aching': '18', 'eighting': '18',
      'nineteen': '19', 'nineting': '19',
      'twenty': '20', 'plenty': '20', 'twenny': '20',
      'thirty': '30', 'thurty': '30', 'dirty': '30',
      'forty': '40', 'fourty': '40',
      'fifty': '50', 'fitty': '50',
      'sixty': '60', 'sixdy': '60',
      'seventy': '70', 'sevendy': '70',
      'eighty': '80', 'aidy': '80',
      'ninety': '90', 'ninedy': '90',
      'zero': '0', 'oh': '0', 'o': '0', 'hero': '0',
      'a': '8', 'it': '8', 'i': '1',
      'see': '3', 'be': '3', 'we': '3',
    };
    
    let processedTranscript = cleanTranscript;
    for (const [soundAlike, number] of Object.entries(soundAlikeReplacements)) {
      const regex = new RegExp(`\\b${soundAlike}\\b`, 'g');
      processedTranscript = processedTranscript.replace(regex, number);
    }
    
    if (processedTranscript !== cleanTranscript) {
      console.log('🔄 Applied sound-alike conversion:', cleanTranscript, '→', processedTranscript);
    }
    
    const directNumberMatch = processedTranscript.match(/\b\d+\b/);
    if (directNumberMatch) {
      const num = parseInt(directNumberMatch[0]);
      if (!isNaN(num) && num >= 0 && num <= 999) {
        console.log('✅ Found number:', num);
        return num;
      }
    }
    
    console.log('❌ No number found in transcript');
    return null;
  };

  const submitAnswer = () => {
    if (hasSubmittedRef.current || showFeedback) return;
    
    const finalAnswer = webSpeechValue || deepgramValue || groqValue || '';
    const numValue = parseInt(finalAnswer);
    
    if (!isNaN(numValue)) {
      console.log('📤 Submitting answer:', numValue);
      console.log('📊 Transcription data at submission:', transcriptionDataRef.current);
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
    console.log('🧹 Cleaning up voice recognition...');
    
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    
    if (recognition) {
      try {
        recognition.abort();
      } catch (error) {
        console.log('Error aborting recognition:', error);
      }
    }
    
    if (audioWebSocketRef.current) {
      audioWebSocketRef.current.close();
      audioWebSocketRef.current = null;
    }
    
    if (transcriptionEventSourceRef.current) {
      transcriptionEventSourceRef.current.close();
      transcriptionEventSourceRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (autoSubmitTimeoutRef.current) {
      clearTimeout(autoSubmitTimeoutRef.current);
      autoSubmitTimeoutRef.current = null;
    }
    
    if (micCheckIntervalRef.current) {
      clearInterval(micCheckIntervalRef.current);
      micCheckIntervalRef.current = null;
    }
    
    setIsListening(false);
    setIsWebSpeechReady(false);
    setIsDeepgramReady(false);
    setIsGroqReady(false);
    setWebSpeechStatus('Stopped');
    setDeepgramStatus('Stopped');
    setGroqStatus('Stopped');
  };

  const handleManualInput = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    setWebSpeechValue(numericValue);
    
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
    console.log('🛑 Stop button clicked');
    cleanup();
  };

  const handleStart = async () => {
    console.log('▶️ Start button clicked');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });
      
      mediaStreamRef.current = stream;
      setupMicrophoneMonitoring(stream);
      setIsListening(true);
      
      if (webSpeechEnabled) {
        initializeWebSpeech();
      }
      if (deepgramEnabled || groqEnabled) {
        await initializeAudioStreaming();
        startTranscriptionMonitoring();
      }
    } catch (error) {
      console.error('❌ Failed to start:', error);
      setWebSpeechStatus('Mic permission denied');
      setDeepgramStatus('Mic permission denied');
      setGroqStatus('Mic permission denied');
    }
  };

  const handleWebSpeechToggle = () => {
    const newState = !webSpeechEnabled;
    setWebSpeechEnabled(newState);
    
    if (newState && isListening && !recognitionRef.current) {
      initializeWebSpeech();
    } else if (!newState && recognitionRef.current) {
      try {
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setIsWebSpeechReady(false);
        setWebSpeechStatus('Disabled');
      } catch (error) {
        console.error('Error stopping Web Speech:', error);
      }
    }
  };

  const handleDeepgramToggle = () => {
    const newState = !deepgramEnabled;
    setDeepgramEnabled(newState);
    
    if (newState && isListening && !audioWebSocketRef.current) {
      initializeAudioStreaming();
      startTranscriptionMonitoring();
    } else if (!newState) {
      setIsDeepgramReady(false);
      setDeepgramStatus('Disabled');
    }
  };

  const handleGroqToggle = () => {
    const newState = !groqEnabled;
    setGroqEnabled(newState);
    
    if (newState && isListening && !audioWebSocketRef.current) {
      initializeAudioStreaming();
      startTranscriptionMonitoring();
    } else if (!newState) {
      setIsGroqReady(false);
      setGroqStatus('Disabled');
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

  const enabledServicesCount = [webSpeechEnabled, deepgramEnabled, groqEnabled].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Question Display */}
      <div className="text-center">
        <p className="text-6xl font-bold text-gray-800">
          {question.num1} {question.operator} {question.num2} = ?
        </p>
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
                🛑 Stop
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={!webSpeechEnabled && !deepgramEnabled && !groqEnabled}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  webSpeechEnabled || deepgramEnabled || groqEnabled
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                ▶️ Start
              </button>
            )}
            
            {/* Service Toggles */}
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={webSpeechEnabled}
                onChange={handleWebSpeechToggle}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Web Speech</span>
            </label>
            
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deepgramEnabled}
                onChange={handleDeepgramToggle}
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-gray-700">Deepgram</span>
            </label>
            
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={groqEnabled}
                onChange={handleGroqToggle}
                className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
              />
              <span className="text-sm font-medium text-gray-700">Groq/Whisper</span>
            </label>
          </div>
        </div>
      )}

      {/* Voice Input Display */}
      {!useTextFallback ? (
        <div className={`grid grid-cols-${enabledServicesCount} gap-4`}>
          {/* Web Speech API Display */}
          {webSpeechEnabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-blue-600">Web Speech API</h3>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    isWebSpeechReady ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <span className="text-sm text-gray-500">{webSpeechStatus}</span>
                </div>
              </div>
              <div className={getInputClassName(showFeedback && webSpeechValue === question.answer.toString(), !!webSpeechValue)}>
                {webSpeechValue ? (
                  <span>{webSpeechValue}</span>
                ) : webSpeechInterim ? (
                  <span className="text-gray-500 italic">{webSpeechInterim}</span>
                ) : (
                  isWebSpeechReady ? (
                    <span className="text-gray-400">Listening for speech...</span>
                  ) : (
                    <span className="text-gray-400">Connecting...</span>
                  )
                )}
              </div>
            </div>
          )}

          {/* Deepgram Display */}
          {deepgramEnabled && (
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
          )}

          {/* Groq/Whisper Display */}
          {groqEnabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-orange-600">Groq/Whisper</h3>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    isGroqReady ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <span className="text-sm text-gray-500">{groqStatus}</span>
                </div>
              </div>
              <div className={getInputClassName(showFeedback && groqValue === question.answer.toString(), !!groqValue)}>
                {groqValue ? (
                  <span>{groqValue}</span>
                ) : groqInterim ? (
                  <span className="text-gray-500 italic">{groqInterim}</span>
                ) : (
                  isGroqReady ? (
                    <span className="text-gray-400">Listening for speech...</span>
                  ) : (
                    <span className="text-gray-400">Connecting...</span>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-between">
          <div className="flex-1 max-w-md mx-auto">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              value={webSpeechValue}
              onChange={(e) => handleManualInput(e.target.value)}
              disabled={showFeedback}
              placeholder="Type your answer"
              className={getInputClassName(undefined, !!webSpeechValue)}
              autoFocus
            />
          </div>
          <TouchpadInput
            value={webSpeechValue}
            onChange={handleManualInput}
            disabled={showFeedback}
            showFeedback={showFeedback}
            wasCorrect={parseInt(webSpeechValue) === question.answer}
          />
        </div>
      )}

      {/* Status Messages */}
      <div className="text-center text-sm text-gray-600">
        {!useTextFallback ? (
          <div>
            <p>Say your answer clearly</p>
            {(webSpeechValue || deepgramValue || groqValue) && !showFeedback && (
              <p className="text-yellow-600 mt-1">
                Waiting for all services or 5 seconds...
              </p>
            )}
            {(!isWebSpeechReady || !isDeepgramReady || !isGroqReady) && (
              <p className="text-orange-600 mt-1">
                Waiting for services to connect...
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
      {showFeedback && webSpeechValue !== question.answer.toString() && deepgramValue !== question.answer.toString() && groqValue !== question.answer.toString() && (
        <div className="text-center">
          <p className="text-2xl text-green-600 font-bold">
            Correct answer: {question.answer}
          </p>
        </div>
      )}

      {/* Debug Panel */}
      <DebugPanel
        show={showDebug}
        webSpeechStatus={webSpeechStatus}
        deepgramStatus={deepgramStatus}
        groqStatus={groqStatus}
        webSpeechValue={webSpeechValue}
        deepgramValue={deepgramValue}
        groqValue={groqValue}
        latencies={{
          webSpeech: transcriptionDataRef.current.webSpeechLatency,
          deepgram: transcriptionDataRef.current.deepgramLatency,
          groq: transcriptionDataRef.current.groqLatency,
          webSpeechProblem: transcriptionDataRef.current.webSpeechProblemLatency,
          deepgramProblem: transcriptionDataRef.current.deepgramProblemLatency,
          groqProblem: transcriptionDataRef.current.groqProblemLatency
        }}
        problemStartTime={problemStartTimeRef.current}
      />
    </div>
  );
};