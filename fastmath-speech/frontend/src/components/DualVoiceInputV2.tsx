import * as React from "react"
import { useState, useRef, useEffect } from "react"
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
  webSpeechLatency: number | null;
  deepgramLatency: number | null;
  webSpeechStartTime: number | null;
  deepgramStartTime: number | null;
}

interface DualVoiceInputV2Props {
  question: {
    num1: number;
    num2: number;
    operator: string;
    answer: number;
  };
  onAnswer: (answer: number, typingData?: { count: number; time: number; inputMethod: 'voice' | 'keyboard' }, transcriptionData?: TranscriptionData) => void;
  showFeedback: boolean;
  enableVoice?: boolean;
}

export const DualVoiceInputV2: React.FC<DualVoiceInputV2Props> = ({ question, onAnswer, showFeedback, enableVoice = true }) => {
  // State for both inputs
  const [webSpeechValue, setWebSpeechValue] = useState('');
  const [deepgramValue, setDeepgramValue] = useState('');
  const [webSpeechStatus, setWebSpeechStatus] = useState('Initializing...');
  const [deepgramStatus, setDeepgramStatus] = useState('Initializing...');
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [showDebug, setShowDebug] = useState(true); // Show debug by default for testing
  
  // Refs
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const problemStartTimeRef = useRef<number>(Date.now());
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubmittedRef = useRef<boolean>(false);
  
  // Transcription data
  const transcriptionDataRef = useRef<TranscriptionData>({
    webSpeechTranscript: null,
    deepgramTranscript: null,
    webSpeechLatency: null,
    deepgramLatency: null,
    webSpeechStartTime: null,
    deepgramStartTime: null
  });

  // Reset on new question
  useEffect(() => {
    console.log('🔄 New question:', `${question.num1} ${question.operator} ${question.num2}`);
    setWebSpeechValue('');
    setDeepgramValue('');
    problemStartTimeRef.current = Date.now();
    hasSubmittedRef.current = false;
    
    if (autoSubmitTimeoutRef.current) {
      clearTimeout(autoSubmitTimeoutRef.current);
      autoSubmitTimeoutRef.current = null;
    }
    
    transcriptionDataRef.current = {
      webSpeechTranscript: null,
      deepgramTranscript: null,
      webSpeechLatency: null,
      deepgramLatency: null,
      webSpeechStartTime: null,
      deepgramStartTime: null
    };
  }, [question]);

  // Initialize voice recognition
  useEffect(() => {
    if (enableVoice && !useTextFallback) {
      initializeWebSpeech();
      initializeDeepgram();
    }
    
    return () => {
      cleanup();
    };
  }, [enableVoice, useTextFallback]);

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
  useEffect(() => {
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
  }, [webSpeechValue, deepgramValue, showFeedback]);

  const initializeWebSpeech = () => {
    try {
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
      recognition.maxAlternatives = 1;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('✅ Web Speech API started');
        setWebSpeechStatus('Listening...');
      };

      recognition.onresult = (event: ISpeechRecognitionEvent) => {
        const results = event.results;
        let latestTranscript = '';
        
        for (let i = event.resultIndex; i < results.length; i++) {
          const result = results[i];
          if (result[0]) {
            latestTranscript = result[0].transcript.trim();
            console.log('🗣️ Web Speech transcript:', latestTranscript, 'Final:', result.isFinal);
            
            const number = extractNumberFromSpeech(latestTranscript);
            if (number !== null) {
              if (!transcriptionDataRef.current.webSpeechStartTime) {
                transcriptionDataRef.current.webSpeechStartTime = Date.now();
                transcriptionDataRef.current.webSpeechLatency = Date.now() - problemStartTimeRef.current;
                console.log('⏱️ Web Speech latency:', transcriptionDataRef.current.webSpeechLatency, 'ms');
              }
              
              transcriptionDataRef.current.webSpeechTranscript = number.toString();
              setWebSpeechValue(number.toString());
              setWebSpeechStatus(`Heard: ${number}`);
            }
          }
        }
      };

      recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
        console.error('❌ Web Speech error:', event.error);
        setWebSpeechStatus(`Error: ${event.error}`);
        
        if (event.error === 'no-speech') {
          return; // This is normal
        }
        
        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
          setUseTextFallback(true);
        }
      };

      recognition.onend = () => {
        console.log('🔚 Web Speech ended, restarting...');
        if (!useTextFallback && !showFeedback && enableVoice) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (error) {
              console.error('Failed to restart Web Speech');
            }
          }, 100);
        }
      };

      recognitionRef.current = recognition;
      
      // Request microphone permission and start
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          console.log('🎤 Microphone permission granted');
          recognition.start();
        })
        .catch(err => {
          console.error('❌ Microphone permission denied:', err);
          setWebSpeechStatus('Mic permission denied');
          setUseTextFallback(true);
        });
      
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
      const configResponse = await fetch('http://localhost:3001/api/voice/deepgram/config');
      const config = await configResponse.json();
      console.log('📋 Deepgram config:', config);

      // Get token
      const tokenResponse = await fetch('http://localhost:3001/api/voice/deepgram/token', {
        method: 'POST',
      });
      const { token } = await tokenResponse.json();
      console.log('🔑 Got Deepgram token');

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      console.log('🎤 Got media stream for Deepgram');

      // Create WebSocket
      let websocketUrl: string;
      if (config.useSimulator) {
        websocketUrl = config.websocketUrl;
        console.log('🔧 Using Deepgram simulator at:', websocketUrl);
      } else {
        websocketUrl = `${config.websocketUrl}?model=nova-2&language=en-US&smart_format=true&interim_results=true`;
        console.log('☁️ Using real Deepgram API');
      }

      const socket = new WebSocket(websocketUrl, config.useSimulator ? undefined : ['token', token]);

      socket.onopen = () => {
        console.log('✅ Deepgram WebSocket connected');
        setDeepgramStatus('Connected');

        // Start sending audio
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        mediaRecorder.start(100); // Send every 100ms
        mediaRecorderRef.current = mediaRecorder;
        console.log('🎙️ Started sending audio to Deepgram');
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 Deepgram message:', data);
        
        if (data.channel?.alternatives?.[0]?.transcript || data.channel?.alternatives?.[0]) {
          const transcript = data.channel.alternatives[0].transcript;
          const isFinal = data.is_final || false;
          
          if (transcript) {
            console.log('🗣️ Deepgram transcript:', transcript, 'Final:', isFinal);
            const number = extractNumberFromSpeech(transcript);
            
            if (number !== null) {
              if (!transcriptionDataRef.current.deepgramStartTime) {
                transcriptionDataRef.current.deepgramStartTime = Date.now();
                transcriptionDataRef.current.deepgramLatency = Date.now() - problemStartTimeRef.current;
                console.log('⏱️ Deepgram latency:', transcriptionDataRef.current.deepgramLatency, 'ms');
              }
              
              transcriptionDataRef.current.deepgramTranscript = number.toString();
              setDeepgramValue(number.toString());
              setDeepgramStatus(`Heard: ${number}`);
            }
          }
        }
      };

      socket.onerror = (error) => {
        console.error('❌ Deepgram WebSocket error:', error);
        setDeepgramStatus('Connection error');
      };

      socket.onclose = () => {
        console.log('🔚 Deepgram WebSocket closed');
        setDeepgramStatus('Disconnected');
      };

      deepgramSocketRef.current = socket;
      
    } catch (error) {
      console.error('❌ Failed to initialize Deepgram:', error);
      setDeepgramStatus('Failed to connect');
    }
  };

  const extractNumberFromSpeech = (transcript: string): number | null => {
    const cleanTranscript = transcript.toLowerCase().trim();
    console.log('🔍 Extracting number from:', cleanTranscript);
    
    // Direct number match
    const directNumberMatch = cleanTranscript.match(/\b\d+\b/);
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
      'eighty': 80, 'ninety': 90
    };
    
    // Check word numbers
    for (const [word, num] of Object.entries(wordToNumber)) {
      if (cleanTranscript.includes(word)) {
        console.log('✅ Found word number:', word, '=', num);
        return num;
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
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {}
      recognitionRef.current = null;
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

  const getInputClassName = (isCorrect?: boolean) => {
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
    `;
    
    if (showFeedback && isCorrect !== undefined) {
      return `${baseClasses} ${isCorrect
        ? 'border-green-500 bg-green-50 text-green-700'
        : 'border-red-500 bg-red-50 text-red-700'
      }`;
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

      {/* Voice Input Display */}
      {!useTextFallback ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Web Speech API Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-blue-600">Web Speech API</h3>
              <span className="text-sm text-gray-500">{webSpeechStatus}</span>
            </div>
            <input
              type="text"
              readOnly
              value={webSpeechValue}
              placeholder="Waiting for speech..."
              className={getInputClassName(showFeedback && webSpeechValue === question.answer.toString())}
            />
          </div>

          {/* Deepgram Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-purple-600">Deepgram</h3>
              <span className="text-sm text-gray-500">{deepgramStatus}</span>
            </div>
            <input
              type="text"
              readOnly
              value={deepgramValue}
              placeholder="Waiting for speech..."
              className={getInputClassName(showFeedback && deepgramValue === question.answer.toString())}
            />
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
              className={getInputClassName()}
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
          </div>
        ) : (
          <div>
            <p>Voice input unavailable - type your answer</p>
            <button
              onClick={() => {
                setUseTextFallback(false);
                initializeWebSpeech();
                initializeDeepgram();
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
          deepgram: transcriptionDataRef.current.deepgramLatency
        }}
      />
    </div>
  );
};