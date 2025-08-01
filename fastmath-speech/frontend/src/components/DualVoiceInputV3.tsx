import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { TouchpadInput } from "./TouchpadInput"
import { DebugPanel } from "./DebugPanel"

// Web Speech API types
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
  webSpeechLatency: number | null; // Latency from speech start
  deepgramLatency: number | null; // Latency from problem display
  webSpeechStartTime: number | null;
  deepgramStartTime: number | null;
  webSpeechProblemLatency: number | null; // Latency from problem display
  deepgramProblemLatency: number | null; // Latency from problem display (same as deepgramLatency)
}

interface DualVoiceInputV3Props {
  question: {
    num1: number;
    num2: number;
    operator: string;
    answer: number;
  };
  onAnswer: (answer: number, typingData?: { count: number; time: number; inputMethod: 'voice' | 'keyboard' }, transcriptionData?: TranscriptionData) => void;
  showFeedback: boolean;
  enableVoice?: boolean;
  onServicesReady?: (webSpeechReady: boolean, deepgramReady: boolean) => void;
}

export const DualVoiceInputV3: React.FC<DualVoiceInputV3Props> = ({ 
  question, 
  onAnswer, 
  showFeedback, 
  enableVoice = true,
  onServicesReady 
}) => {
  // State for both inputs
  const [webSpeechValue, setWebSpeechValue] = useState('');
  const [deepgramValue, setDeepgramValue] = useState('');
  const [webSpeechInterim, setWebSpeechInterim] = useState('');
  const [deepgramInterim, setDeepgramInterim] = useState('');
  const [webSpeechStatus, setWebSpeechStatus] = useState('Initializing...');
  const [deepgramStatus, setDeepgramStatus] = useState('Initializing...');
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [isWebSpeechReady, setIsWebSpeechReady] = useState(false);
  const [isDeepgramReady, setIsDeepgramReady] = useState(false);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  
  // Refs
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const problemStartTimeRef = useRef<number>(Date.now());
  const sharedSpeechStartTimeRef = useRef<number | null>(null); // Shared speech start time for both services
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubmittedRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Transcription data
  const transcriptionDataRef = useRef<TranscriptionData>({
    webSpeechTranscript: null,
    deepgramTranscript: null,
    webSpeechLatency: null,
    deepgramLatency: null,
    webSpeechStartTime: null,
    deepgramStartTime: null,
    webSpeechProblemLatency: null,
    deepgramProblemLatency: null
  });

  // Notify parent when services are ready
  useEffect(() => {
    if (onServicesReady) {
      onServicesReady(isWebSpeechReady, isDeepgramReady);
    }
  }, [isWebSpeechReady, isDeepgramReady, onServicesReady]);

  // Reset on new question
  useEffect(() => {
    console.log('🔄 New question:', `${question.num1} ${question.operator} ${question.num2}`);
    setWebSpeechValue('');
    setDeepgramValue('');
    setWebSpeechInterim('');
    setDeepgramInterim('');
    problemStartTimeRef.current = Date.now();
    hasSubmittedRef.current = false;
    
    // Reset transcription data for new question
    sharedSpeechStartTimeRef.current = null; // Reset shared speech start time
    transcriptionDataRef.current = {
      webSpeechTranscript: null,
      deepgramTranscript: null,
      webSpeechLatency: null,
      deepgramLatency: null,
      webSpeechStartTime: null,
      deepgramStartTime: null,
      webSpeechProblemLatency: null,
      deepgramProblemLatency: null
    };
    
    if (autoSubmitTimeoutRef.current) {
      clearTimeout(autoSubmitTimeoutRef.current);
      autoSubmitTimeoutRef.current = null;
    }
    
    sharedSpeechStartTimeRef.current = null; // Reset shared speech start time
    transcriptionDataRef.current = {
      webSpeechTranscript: null,
      deepgramTranscript: null,
      webSpeechLatency: null,
      deepgramLatency: null,
      webSpeechStartTime: null,
      deepgramStartTime: null,
      webSpeechProblemLatency: null,
      deepgramProblemLatency: null
    };
  }, [question]);

  // Initialize voice recognition only once
  useEffect(() => {
    let mounted = true;
    let initializationInProgress = false;
    
    const init = async () => {
      if (!mounted || initializationInProgress || !enableVoice || useTextFallback) return;
      
      // Prevent multiple initializations
      if (recognitionRef.current || deepgramSocketRef.current) {
        console.log('⚠️ Services already initialized, skipping...');
        return;
      }
      
      initializationInProgress = true;
      
      try {
        // Request microphone permission first
        console.log('🎤 Requesting microphone permission...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        
        console.log('✅ Microphone permission granted');
        
        if (!mounted) return; // Component unmounted during async operation
        
        // Keep the stream for monitoring
        mediaStreamRef.current = stream;
        setupMicrophoneMonitoring(stream);
        
        // Now initialize both services
        if (mounted) {
          initializeWebSpeech();
          initializeDeepgram();
        }
      } catch (error) {
        console.error('❌ Microphone permission denied:', error);
        if (mounted) {
          setWebSpeechStatus('Mic permission denied');
          setDeepgramStatus('Mic permission denied');
          setUseTextFallback(true);
        }
      } finally {
        initializationInProgress = false;
      }
    };
    
    init();
    
    return () => {
      mounted = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableVoice, useTextFallback]); // Only re-init if these change

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

  // Setup microphone activity monitoring
  const setupMicrophoneMonitoring = (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      source.connect(analyser);
      analyser.fftSize = 256;
      
      audioContextRef.current = audioContext;
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

  // Check if we should auto-submit
  const checkAutoSubmit = useCallback(() => {
    if (showFeedback || hasSubmittedRef.current) return;
    
    const hasWebSpeech = webSpeechValue !== '';
    const hasDeepgram = deepgramValue !== '';
    
    console.log('📊 Input status - Web Speech:', webSpeechValue, 'Deepgram:', deepgramValue);
    
    // If both have values, submit immediately
    if (hasWebSpeech && hasDeepgram) {
      console.log('✅ Both inputs have values, submitting...');
      submitAnswer();
    }
    // If one has value, start 5-second timer
    else if ((hasWebSpeech || hasDeepgram) && !autoSubmitTimeoutRef.current) {
      console.log('⏰ Starting 5-second timer for auto-submit...');
      autoSubmitTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Timer expired, submitting with available data...');
        submitAnswer();
      }, 5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSpeechValue, deepgramValue, showFeedback]);

  useEffect(() => {
    checkAutoSubmit();
  }, [checkAutoSubmit]);

  const initializeWebSpeech = () => {
    try {
      // Check if already initialized
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
      recognition.maxAlternatives = 3; // Get more alternatives
      recognition.lang = 'en-US';

      // All event handlers
      recognition.onstart = () => {
        console.log('✅ Web Speech API started');
        setWebSpeechStatus('Listening...');
        setIsWebSpeechReady(true);
      };

      recognition.onaudiostart = () => {
        console.log('🔊 Web Speech: Audio started');
      };

      recognition.onsoundstart = () => {
        console.log('🔊 Web Speech: Sound detected');
      };

      recognition.onspeechstart = () => {
        const now = Date.now();
        const timeSinceProblem = now - problemStartTimeRef.current;
        console.log('🗣️ Web Speech: Speech started at', timeSinceProblem, 'ms after problem shown');
        
        // Set shared speech start time for both services (first one wins)
        if (!sharedSpeechStartTimeRef.current) {
          sharedSpeechStartTimeRef.current = now;
          console.log('🎤 Set shared speech start time:', now);
        }
        
        // Record when speech actually starts - only if not already set for this question
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
            
            // Show interim results
            if (!result.isFinal) {
              setWebSpeechInterim(transcript);
            }
            
            // Try all alternatives for number extraction
            for (let j = 0; j < result.length; j++) {
              const altTranscript = result[j].transcript.trim();
              const number = extractNumberFromSpeech(altTranscript);
              
              if (number !== null && result.isFinal) {
                const now = Date.now();
                
                // If webSpeechStartTime wasn't set by onspeechstart, set it now
                // This handles cases where speech events don't fire in the expected order
                if (!transcriptionDataRef.current.webSpeechStartTime) {
                  // Use shared speech start time if available
                  if (sharedSpeechStartTimeRef.current) {
                    transcriptionDataRef.current.webSpeechStartTime = sharedSpeechStartTimeRef.current;
                    console.log('📍 Using shared speech start time for Web Speech:', sharedSpeechStartTimeRef.current);
                  } else {
                    // Estimate speech start time based on typical speech recognition delay
                    const estimatedStart = now - 500; // Assume 500ms recognition delay
                    transcriptionDataRef.current.webSpeechStartTime = estimatedStart;
                    sharedSpeechStartTimeRef.current = estimatedStart; // Set shared time
                    console.log('⚠️ Web Speech start time not set by onspeechstart, estimating:', estimatedStart);
                  }
                }
                
                // Calculate latency from when speech started
                if (transcriptionDataRef.current.webSpeechStartTime) {
                  transcriptionDataRef.current.webSpeechLatency = now - transcriptionDataRef.current.webSpeechStartTime;
                  console.log('⏱️ Web Speech latency (from speech start):', transcriptionDataRef.current.webSpeechLatency, 'ms');
                }
                
                // Always calculate latency from problem display
                transcriptionDataRef.current.webSpeechProblemLatency = now - problemStartTimeRef.current;
                console.log('⏱️ Web Speech latency (from problem display):', transcriptionDataRef.current.webSpeechProblemLatency, 'ms');
                
                transcriptionDataRef.current.webSpeechTranscript = number.toString();
                setWebSpeechValue(number.toString());
                setWebSpeechInterim('');
                setWebSpeechStatus(`Heard: ${number}`);
                console.log('✅ Web Speech captured number:', number);
                console.log('📊 Updated transcriptionData:', transcriptionDataRef.current);
                break; // Found a number, stop checking alternatives
              }
            }
          }
        }
      };

      recognition.onspeechend = () => {
        console.log('🔇 Web Speech: Speech ended');
      };

      recognition.onsoundend = () => {
        console.log('🔇 Web Speech: Sound ended');
      };

      recognition.onaudioend = () => {
        console.log('🔇 Web Speech: Audio ended');
      };

      recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
        console.error('❌ Web Speech error:', event.error, event.message);
        setWebSpeechStatus(`Error: ${event.error}`);
        
        if (event.error === 'no-speech') {
          // This is normal - continue listening
          return;
        }
        
        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
          setUseTextFallback(true);
          setIsWebSpeechReady(false);
        }
        
        if (event.error === 'aborted') {
          // Don't try to restart on abort - it's usually because we're cleaning up
          console.log('🛑 Recognition aborted - not restarting');
        }
      };

      recognition.onend = () => {
        console.log('🔚 Web Speech ended');
        setIsWebSpeechReady(false);
        
        // Only restart if we're still the active instance and not showing feedback
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
          }, 1000); // Longer delay to prevent rapid restarts
        }
      };

      recognitionRef.current = recognition;
      
      // Start recognition immediately since we already have permission
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

  const initializeDeepgram = async () => {
    try {
      console.log('🌐 Initializing Deepgram...');
      setDeepgramStatus('Connecting...');
      
      // Get configuration
      let config, token;
      try {
        const configResponse = await fetch('http://localhost:3001/api/voice/deepgram/config');
        if (!configResponse.ok) {
          throw new Error(`Config fetch failed: ${configResponse.status}`);
        }
        config = await configResponse.json();
        console.log('📋 Deepgram config:', config);

        // Get token
        const tokenResponse = await fetch('http://localhost:3001/api/voice/deepgram/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        if (!tokenResponse.ok) {
          throw new Error(`Token fetch failed: ${tokenResponse.status}`);
        }
        const tokenData = await tokenResponse.json();
        token = tokenData.token;
        console.log('🔑 Got Deepgram token:', token ? 'Yes' : 'No');
      } catch (error) {
        console.error('❌ Failed to get Deepgram config/token:', error);
        setDeepgramStatus('Config/token error');
        setIsDeepgramReady(false);
        return;
      }

      // Use existing media stream
      const stream = mediaStreamRef.current;
      if (!stream) {
        console.error('❌ No media stream available for Deepgram');
        setDeepgramStatus('No microphone access');
        return;
      }
      console.log('🎤 Using existing media stream for Deepgram');

      // Create WebSocket
      let websocketUrl: string;
      if (config.useSimulator) {
        websocketUrl = config.websocketUrl;
        console.log('🔧 Using Deepgram simulator at:', websocketUrl);
      } else {
        // For real Deepgram API, use wss:// protocol
        // Use simplified URL - Deepgram auto-detects audio parameters
        websocketUrl = 'wss://api.deepgram.com/v1/listen';
        console.log('☁️ Using real Deepgram API with simplified URL');
      }

      // For client-side connections, use Sec-WebSocket-Protocol header
      // Create WebSocket with proper protocol headers for Deepgram
      const socket = config.useSimulator 
        ? new WebSocket(websocketUrl)
        : new WebSocket(websocketUrl, ['token', token]);
      
      console.log('🔌 Creating WebSocket connection...');

      socket.onopen = () => {
        console.log('✅ Deepgram WebSocket connected');
        console.log('WebSocket URL:', websocketUrl);
        console.log('WebSocket protocol:', socket.protocol);
        console.log('WebSocket readyState:', socket.readyState);
        setDeepgramStatus('Connected');
        setIsDeepgramReady(true);

        // Start sending audio
        // Use simple audio/webm format that worked in test
        const mimeType = 'audio/webm';
        console.log('🎤 Using MIME type:', mimeType);
        
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: mimeType
        });

        let chunkCount = 0;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            chunkCount++;
            if (chunkCount <= 5 || chunkCount % 10 === 0) {
              console.log(`📤 Sending audio chunk #${chunkCount} to Deepgram, size:`, event.data.size);
            }
            socket.send(event.data);
          } else if (socket.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ WebSocket not open, skipping audio chunk');
          }
        };

        mediaRecorder.start(250); // Send every 250ms (Deepgram recommended)
        mediaRecorderRef.current = mediaRecorder;
        console.log('🎙️ Started sending audio to Deepgram');
        console.log('MediaRecorder state:', mediaRecorder.state);
        console.log('MediaRecorder mimeType:', mediaRecorder.mimeType);
        console.log('Audio tracks:', stream.getAudioTracks().map(t => ({
          label: t.label,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState
        })));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Deepgram message type:', data.type);
          console.log('Full message:', JSON.stringify(data, null, 2));
          
          // Check different message types
          if (data.type === 'Metadata') {
            console.log('🔄 Deepgram metadata received');
            return;
          }
          
          // Handle transcription results
          if (data.type === 'Results') {
            console.log('Deepgram Results - has channel:', !!data.channel);
            console.log('Deepgram Results - has alternatives:', !!data.channel?.alternatives);
            console.log('Deepgram Results - alternatives length:', data.channel?.alternatives?.length);
            
            if (data.channel?.alternatives?.[0]) {
              const transcript = data.channel.alternatives[0].transcript || '';
              const isFinal = data.is_final || data.speech_final || false;
              console.log('Transcript present:', !!transcript, 'Length:', transcript.length);
              
              if (transcript) {
                console.log('🗣️ Deepgram transcript:', transcript, 'Final:', isFinal);
                
                // Also log if transcript is empty
                if (!transcript && isFinal) {
                  console.log('⚠️ Deepgram sent final result with empty transcript');
                  console.log('Alternative 0:', JSON.stringify(data.channel.alternatives[0]));
                }
                
                // Show interim results
                if (!isFinal) {
                  setDeepgramInterim(transcript);
                }
                
                const number = extractNumberFromSpeech(transcript);
                
                if (number !== null && isFinal) {
                  const now = Date.now();
                  transcriptionDataRef.current.deepgramStartTime = now;
                  
                  // Calculate latency from problem display
                  transcriptionDataRef.current.deepgramProblemLatency = now - problemStartTimeRef.current;
                  
                  // Calculate latency from speech start using shared reference
                  if (sharedSpeechStartTimeRef.current) {
                    transcriptionDataRef.current.deepgramLatency = now - sharedSpeechStartTimeRef.current;
                    console.log('⏱️ Deepgram latency from speech start:', transcriptionDataRef.current.deepgramLatency, 'ms');
                  } else {
                    // If no shared speech start time, estimate based on typical delay
                    const estimatedSpeechStart = now - 1000; // Assume ~1s from speech to transcription
                    transcriptionDataRef.current.deepgramLatency = now - estimatedSpeechStart;
                    sharedSpeechStartTimeRef.current = estimatedSpeechStart; // Set shared time
                    console.log('⏱️ Deepgram latency (estimated from speech start):', transcriptionDataRef.current.deepgramLatency, 'ms');
                  }
                  
                  console.log('⏱️ Deepgram latency from problem display:', transcriptionDataRef.current.deepgramProblemLatency, 'ms');
                  
                  transcriptionDataRef.current.deepgramTranscript = number.toString();
                  setDeepgramValue(number.toString());
                  setDeepgramInterim('');
                  setDeepgramStatus(`Heard: ${number}`);
                }
              }
            } else {
              console.log('⚠️ No alternatives in Deepgram result');
            }
          } else if (data.type === 'Error') {
            console.error('❌ Deepgram error message:', data);
            setDeepgramStatus(`Error: ${data.error || 'Unknown'}`);
          }
        } catch (error) {
          console.error('❌ Failed to parse Deepgram message:', error);
        }
      };

      socket.onerror = (error) => {
        console.error('❌ Deepgram WebSocket error:', error);
        setDeepgramStatus('Connection error');
        setIsDeepgramReady(false);
      };

      socket.onclose = () => {
        console.log('🔚 Deepgram WebSocket closed');
        setDeepgramStatus('Disconnected');
        setIsDeepgramReady(false);
      };

      deepgramSocketRef.current = socket;
      
    } catch (error) {
      console.error('❌ Failed to initialize Deepgram:', error);
      setDeepgramStatus('Failed to connect');
      setIsDeepgramReady(false);
    }
  };

  const extractNumberFromSpeech = (transcript: string): number | null => {
    const cleanTranscript = transcript.toLowerCase().trim();
    console.log('🔍 Extracting number from:', cleanTranscript);
    
    // Special case: convert "for" to "4"
    const processedTranscript = cleanTranscript.replace(/\bfor\b/g, '4');
    if (processedTranscript !== cleanTranscript) {
      console.log('🔄 Converted "for" to "4":', processedTranscript);
    }
    
    // Direct number match
    const directNumberMatch = processedTranscript.match(/\b\d+\b/);
    if (directNumberMatch) {
      const num = parseInt(directNumberMatch[0]);
      if (!isNaN(num) && num >= 0 && num <= 999) {
        console.log('✅ Found number:', num);
        return num;
      }
    }
    
    // Word to number mapping
    const wordToNumber: { [key: string]: number } = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
      'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
      'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
      'eighty': 80, 'ninety': 90,
      'for': 4  // Additional mapping for common misrecognition
    };
    
    // Check word numbers
    for (const [word, num] of Object.entries(wordToNumber)) {
      if (cleanTranscript.includes(word)) {
        console.log('✅ Found word number:', word, '=', num);
        return num;
      }
    }
    
    // Handle compound numbers
    const compoundPatterns = [
      { regex: /twenty[- ]?(\w+)/, base: 20 },
      { regex: /thirty[- ]?(\w+)/, base: 30 },
      { regex: /forty[- ]?(\w+)/, base: 40 },
      { regex: /fifty[- ]?(\w+)/, base: 50 },
      { regex: /sixty[- ]?(\w+)/, base: 60 },
      { regex: /seventy[- ]?(\w+)/, base: 70 },
      { regex: /eighty[- ]?(\w+)/, base: 80 },
      { regex: /ninety[- ]?(\w+)/, base: 90 }
    ];
    
    for (const pattern of compoundPatterns) {
      const match = cleanTranscript.match(pattern.regex);
      if (match && match[1] && wordToNumber[match[1]]) {
        const result = pattern.base + wordToNumber[match[1]];
        console.log('✅ Found compound number:', result);
        return result;
      }
    }
    
    console.log('❌ No number found in transcript');
    return null;
  };

  const submitAnswer = () => {
    if (hasSubmittedRef.current || showFeedback) return;
    
    // Use whichever value we have
    const finalAnswer = webSpeechValue || deepgramValue || '';
    const numValue = parseInt(finalAnswer);
    
    if (!isNaN(numValue)) {
      console.log('📤 Submitting answer:', numValue);
      console.log('📊 Transcription data at submission:', {
        webSpeechTranscript: transcriptionDataRef.current.webSpeechTranscript,
        deepgramTranscript: transcriptionDataRef.current.deepgramTranscript,
        webSpeechLatency: transcriptionDataRef.current.webSpeechLatency,
        deepgramLatency: transcriptionDataRef.current.deepgramLatency,
        webSpeechStartTime: transcriptionDataRef.current.webSpeechStartTime,
        deepgramStartTime: transcriptionDataRef.current.deepgramStartTime,
        webSpeechProblemLatency: transcriptionDataRef.current.webSpeechProblemLatency,
        deepgramProblemLatency: transcriptionDataRef.current.deepgramProblemLatency
      });
      hasSubmittedRef.current = true;
      
      // Clear any pending timer
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
    
    // Clear the recognition reference first to prevent restart attempts
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    
    if (recognition) {
      try {
        recognition.abort(); // Use abort to immediately stop
      } catch (error) {
        console.log('Error aborting recognition:', error);
      }
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (deepgramSocketRef.current) {
      deepgramSocketRef.current.close();
      deepgramSocketRef.current = null;
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
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const handleManualInput = (value: string) => {
    setWebSpeechValue(value);
    
    // Auto-submit for single digit answers
    if (value.length === question.answer.toString().length) {
      const numValue = parseInt(value);
      if (!isNaN(numValue)) {
        onAnswer(numValue, {
          count: 1,
          time: 0,
          inputMethod: 'keyboard' as const
        });
      }
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
    
    // Highlight when value is captured
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

      {/* Microphone Activity Indicator */}
      {!useTextFallback && (
        <div className="flex justify-center items-center space-x-2">
          <div className={`w-4 h-4 rounded-full transition-all ${
            microphoneActive ? 'bg-red-500 animate-pulse' : 'bg-gray-300'
          }`} />
          <span className="text-sm text-gray-600">
            {microphoneActive ? 'Microphone active' : 'Microphone idle'}
          </span>
        </div>
      )}

      {/* Voice Input Display */}
      {!useTextFallback ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Web Speech API Display */}
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

          {/* Deepgram Display */}
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
        </div>
      ) : (
        <div className="flex justify-between">
          <div className="flex-1 max-w-md mx-auto">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              value={webSpeechValue}
              onChange={(e) => handleManualInput(e.target.value.replace(/\D/g, ''))}
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
            {(webSpeechValue || deepgramValue) && !showFeedback && (
              <p className="text-yellow-600 mt-1">
                Waiting for both inputs or 5 seconds...
              </p>
            )}
            {(!isWebSpeechReady || !isDeepgramReady) && (
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
                // Re-initialization will happen via useEffect when useTextFallback changes
              }}
              className="text-blue-600 hover:underline mt-2"
            >
              Try voice again
            </button>
          </div>
        )}
      </div>

      {/* Show correct answer if wrong */}
      {showFeedback && webSpeechValue !== question.answer.toString() && deepgramValue !== question.answer.toString() && (
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
        webSpeechValue={webSpeechValue}
        deepgramValue={deepgramValue}
        latencies={{
          webSpeech: transcriptionDataRef.current.webSpeechLatency,
          deepgram: transcriptionDataRef.current.deepgramLatency,
          webSpeechProblem: transcriptionDataRef.current.webSpeechProblemLatency,
          deepgramProblem: transcriptionDataRef.current.deepgramProblemLatency
        }}
        problemStartTime={problemStartTimeRef.current}
      />
    </div>
  );
};