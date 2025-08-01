import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { TouchpadInput } from "./TouchpadInput"

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

interface DualVoiceInputProps {
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

export const DualVoiceInput: React.FC<DualVoiceInputProps> = ({ question, onAnswer, showFeedback, enableVoice = true }) => {
  const [value, setValue] = useState('');
  const [lastAnswer, setLastAnswer] = useState<number | null>(null);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isDeepgramConnected, setIsDeepgramConnected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Timing refs
  const firstKeystrokeTime = useRef<number | null>(null);
  const lastKeystrokeTime = useRef<number | null>(null);
  
  // Transcription data refs
  const transcriptionDataRef = useRef<TranscriptionData>({
    webSpeechTranscript: null,
    deepgramTranscript: null,
    webSpeechLatency: null,
    deepgramLatency: null,
    webSpeechStartTime: null,
    deepgramStartTime: null
  });
  
  // Speech recognition refs
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  
  // Problem start time for latency calculation
  const problemStartTimeRef = useRef<number>(Date.now());

  // Check for Web Speech API support
  const checkSpeechSupport = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return !!SpeechRecognition;
  };

  const calculateTypingData = (isCorrect: boolean) => {
    const answerLength = question.answer.toString().length;
    
    if (!isCorrect) {
      return {
        count: 1,
        time: 0,
        inputMethod: 'keyboard' as const
      };
    }

    if (answerLength <= 1 || !firstKeystrokeTime.current || !lastKeystrokeTime.current) {
      return {
        count: 1,
        time: 0,
        inputMethod: 'keyboard' as const
      };
    }

    const totalTypingTime = lastKeystrokeTime.current - firstKeystrokeTime.current;
    const averageTypingTime = answerLength === 3 ? totalTypingTime / 2 : totalTypingTime;

    return {
      count: 1,
      time: averageTypingTime,
      inputMethod: 'keyboard' as const
    };
  };

  // Initialize both speech recognition systems
  useEffect(() => {
    if (enableVoice) {
      const supported = checkSpeechSupport();
      setSpeechSupported(supported);
      
      if (supported && !useTextFallback) {
        initializeWebSpeech();
        initializeDeepgram();
      } else if (!supported) {
        setUseTextFallback(true);
        setConnectionError('Speech recognition not supported in this browser');
      }
    } else {
      setUseTextFallback(true);
    }
    
    return () => {
      cleanup();
    };
  }, [enableVoice, useTextFallback]);

  useEffect(() => {
    setValue('');
    setLastAnswer(null);
    setWasCorrect(false);
    setConnectionError(null);
    firstKeystrokeTime.current = null;
    lastKeystrokeTime.current = null;
    problemStartTimeRef.current = Date.now();
    
    // Reset transcription data
    transcriptionDataRef.current = {
      webSpeechTranscript: null,
      deepgramTranscript: null,
      webSpeechLatency: null,
      deepgramLatency: null,
      webSpeechStartTime: null,
      deepgramStartTime: null
    };
  }, [question]);

  useEffect(() => {
    if ((useTextFallback || !enableVoice) && inputRef.current && !showFeedback) {
      inputRef.current.focus();
    }
  }, [showFeedback, useTextFallback, enableVoice]);

  const initializeWebSpeech = () => {
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setConnectionError('Speech recognition not supported in this browser');
        setUseTextFallback(true);
        return;
      }
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        console.log('Web Speech API started');
        setIsListening(true);
        setConnectionError(null);
      };
      
      recognition.onresult = (event: ISpeechRecognitionEvent) => {
        const results = event.results;
        let latestTranscript = '';
        
        for (let i = event.resultIndex; i < results.length; i++) {
          const result = results[i];
          if (result[0]) {
            latestTranscript = result[0].transcript.trim();
            
            // Extract number from transcript
            const number = extractNumberFromSpeech(latestTranscript);
            if (number !== null) {
              // Record first detection time for Web Speech
              if (!transcriptionDataRef.current.webSpeechStartTime) {
                transcriptionDataRef.current.webSpeechStartTime = Date.now();
                transcriptionDataRef.current.webSpeechLatency = Date.now() - problemStartTimeRef.current;
              }
              
              transcriptionDataRef.current.webSpeechTranscript = number.toString();
              setValue(number.toString());
              
              // If this is a final result, process the answer
              if (result.isFinal) {
                processVoiceAnswer(number);
              }
            }
          }
        }
      };
      
      recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
        console.error('Web Speech API error:', event.error);
        
        switch (event.error) {
          case 'no-speech':
            break;
          case 'audio-capture':
          case 'not-allowed':
            setConnectionError('Microphone access denied');
            setUseTextFallback(true);
            break;
          case 'network':
            setConnectionError('Network error');
            break;
          default:
            console.log(`Speech error: ${event.error}`);
        }
      };
      
      recognition.onend = () => {
        console.log('Web Speech API ended, restarting...');
        setIsListening(false);
        
        if (!useTextFallback && !showFeedback && enableVoice) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (error) {
              console.error('Failed to restart Web Speech API');
            }
          }, 100);
        }
      };
      
      recognitionRef.current = recognition;
      
      if (!showFeedback) {
        recognition.start();
      }
      
    } catch (error) {
      console.error('Failed to initialize Web Speech API:', error);
      setConnectionError('Speech recognition initialization failed');
      setUseTextFallback(true);
    }
  };

  const initializeDeepgram = async () => {
    try {
      // First, get Deepgram configuration
      const configResponse = await fetch('http://localhost:3001/api/voice/deepgram/config');
      const config = await configResponse.json();

      // Get Deepgram token from backend
      const tokenResponse = await fetch('http://localhost:3001/api/voice/deepgram/token', {
        method: 'POST',
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get Deepgram token');
      }

      const { token } = await tokenResponse.json();

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Create WebSocket connection based on configuration
      let websocketUrl: string;
      let protocols: string | string[] | undefined;

      if (config.useSimulator) {
        // Connect to local simulator
        websocketUrl = config.websocketUrl;
        protocols = undefined; // Local simulator doesn't use subprotocols
        console.log('Connecting to Deepgram simulator at:', websocketUrl);
      } else {
        // Connect to real Deepgram API
        websocketUrl = `${config.websocketUrl}?model=nova-2&language=en-US&smart_format=true&interim_results=true`;
        protocols = ['token', token];
        console.log('Connecting to Deepgram API');
      }

      const socket = new WebSocket(websocketUrl, protocols);

      socket.onopen = () => {
        console.log('Deepgram WebSocket connected');
        setIsDeepgramConnected(true);

        // Start sending audio data
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        mediaRecorder.start(100); // Send data every 100ms
        mediaRecorderRef.current = mediaRecorder;
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.channel?.alternatives?.[0]?.transcript) {
          const transcript = data.channel.alternatives[0].transcript;
          const isFinal = data.is_final || false;

          if (transcript) {
            // Extract number from Deepgram transcript
            const number = extractNumberFromSpeech(transcript);
            if (number !== null) {
              // Record first detection time for Deepgram
              if (!transcriptionDataRef.current.deepgramStartTime) {
                transcriptionDataRef.current.deepgramStartTime = Date.now();
                transcriptionDataRef.current.deepgramLatency = Date.now() - problemStartTimeRef.current;
              }
              
              transcriptionDataRef.current.deepgramTranscript = number.toString();
              
              // Only process if Web Speech hasn't already processed
              if (!transcriptionDataRef.current.webSpeechTranscript && isFinal) {
                setValue(number.toString());
                processVoiceAnswer(number);
              }
            }
          }
        }
      };

      socket.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error);
        setIsDeepgramConnected(false);
      };

      socket.onclose = () => {
        console.log('Deepgram WebSocket closed');
        setIsDeepgramConnected(false);
      };

      deepgramSocketRef.current = socket;
    } catch (error) {
      console.error('Failed to initialize Deepgram:', error);
    }
  };

  // Extract number from speech transcript
  const extractNumberFromSpeech = (transcript: string): number | null => {
    const cleanTranscript = transcript.toLowerCase().trim();
    
    // First try to match direct numbers
    const directNumberMatch = cleanTranscript.match(/\b\d+\b/);
    if (directNumberMatch) {
      const num = parseInt(directNumberMatch[0]);
      if (!isNaN(num) && num >= 0 && num <= 999) {
        return num;
      }
    }
    
    // Map word numbers to digits
    const wordToNumber: { [key: string]: number } = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
      'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
      'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
      'eighty': 80, 'ninety': 90, 'hundred': 100
    };
    
    // Try to match word numbers
    for (const [word, num] of Object.entries(wordToNumber)) {
      if (cleanTranscript.includes(word)) {
        return num;
      }
    }
    
    // Handle compound numbers
    const twentyMatch = cleanTranscript.match(/twenty[- ]?(\w+)/);
    if (twentyMatch && wordToNumber[twentyMatch[1]]) {
      return 20 + wordToNumber[twentyMatch[1]];
    }
    
    const thirtyMatch = cleanTranscript.match(/thirty[- ]?(\w+)/);
    if (thirtyMatch && wordToNumber[thirtyMatch[1]]) {
      return 30 + wordToNumber[thirtyMatch[1]];
    }
    
    return null;
  };

  const processVoiceAnswer = (number: number) => {
    if (showFeedback) return;
    
    const isCorrect = number === question.answer;
    setLastAnswer(question.answer);
    setWasCorrect(isCorrect);
    
    // Use voice timing data with transcription data
    onAnswer(number, {
      count: 1,
      time: 0,
      inputMethod: 'voice' as const
    }, transcriptionDataRef.current);
  };

  const cleanup = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
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
    
    setIsListening(false);
    setIsDeepgramConnected(false);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!value || showFeedback || !useTextFallback) return;

    const numValue = parseInt(value);
    if (!isNaN(numValue)) {
      const isCorrect = numValue === question.answer;
      setLastAnswer(question.answer);
      setWasCorrect(isCorrect);
      onAnswer(numValue, calculateTypingData(isCorrect));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handleInputChange = (newValue: string) => {
    if (!useTextFallback) return;
    
    const isMultiDigitAnswer = question.answer.toString().length > 1;

    if (isMultiDigitAnswer) {
      const now = Date.now();
      
      if (newValue.length === 1) {
        firstKeystrokeTime.current = now;
      }
      
      if (newValue.length > 0) {
        lastKeystrokeTime.current = now;
      }
    }

    setValue(newValue);

    if (newValue.length === question.answer.toString().length) {
      const numValue = parseInt(newValue);
      if (!isNaN(numValue)) {
        const isCorrect = numValue === question.answer;
        setLastAnswer(question.answer);
        setWasCorrect(isCorrect);
        onAnswer(numValue, calculateTypingData(isCorrect));
      }
    }
  };

  const handleNativeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!useTextFallback) return;
    
    const newValue = e.target.value.replace(/\D/g, '');
    handleInputChange(newValue);
  };

  const getVoiceStatusText = () => {
    if (!enableVoice) return '';
    if (connectionError) return 'Voice unavailable - using text';
    if (!speechSupported) return 'Speech not supported';
    if (isListening && isDeepgramConnected) return 'Both services listening...';
    if (isListening) return 'Web Speech listening...';
    if (isDeepgramConnected) return 'Deepgram listening...';
    if (!useTextFallback) return 'Say your answer';
    return '';
  };

  const getInputClassName = () => {
    const baseClasses = `
      w-48 
      p-4 
      text-4xl 
      font-bold 
      text-center 
      rounded-lg
      border-4
      outline-none
      transition-all
      duration-200
    `;
    
    if (!showFeedback) {
      if ((isListening || isDeepgramConnected) && !useTextFallback) {
        return `${baseClasses} border-blue-500 bg-blue-50 text-blue-700`;
      } else {
        return `${baseClasses} border-gray-200 focus:border-gray-200 bg-white text-gray-700`;
      }
    } else {
      return `${baseClasses} ${wasCorrect
        ? 'border-green-500 bg-green-50 text-green-700'
        : 'border-red-500 bg-red-50 text-red-700'
      }`;
    }
  };

  return (
    <div className="flex justify-between">
      {/* Left side - Question and input */}
      <div className="flex flex-col items-center justify-center flex-1">
        <p className="text-6xl font-bold text-gray-800 mb-8">
          {question.num1} {question.operator} {question.num2} = ?
        </p>

        <div className="relative">
          {/* Voice status indicator */}
          {enableVoice && !useTextFallback && (
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-sm text-gray-600">
              {getVoiceStatusText()}
              {(isListening || isDeepgramConnected) && (
                <div className="inline-block ml-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              )}
            </div>
          )}
          
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            value={value}
            onChange={handleNativeInputChange}
            onKeyPress={handleKeyPress}
            disabled={showFeedback || (!useTextFallback && enableVoice)}
            readOnly={!useTextFallback && enableVoice}
            placeholder={
              !useTextFallback && enableVoice 
                ? (isListening || isDeepgramConnected ? "Listening..." : "Voice") 
                : ""
            }
            className={getInputClassName()}
          />
          
          {showFeedback && !wasCorrect && lastAnswer !== null && (
            <div className="absolute -right-20 top-1/2 -translate-y-1/2 text-green-500 font-bold text-2xl">
              {lastAnswer}
            </div>
          )}
          
          {/* Fallback toggle button */}
          {enableVoice && connectionError && (
            <button
              onClick={() => setUseTextFallback(!useTextFallback)}
              className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-blue-600 hover:text-blue-800"
            >
              {useTextFallback ? 'Try voice again' : 'Use keyboard'}
            </button>
          )}
        </div>
      </div>

      {/* Right side - Touchpad (only show when using text input) */}
      {(useTextFallback || !enableVoice) && (
        <TouchpadInput
          value={value}
          onChange={handleInputChange}
          disabled={showFeedback}
          showFeedback={showFeedback}
          wasCorrect={wasCorrect}
        />
      )}
    </div>
  );
};