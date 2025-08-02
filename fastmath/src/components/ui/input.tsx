import * as React from "react"
import { useState, useRef, useEffect } from "react"
import { TouchpadInput } from "./TouchpadInput"
import { QuestionVoiceInputEnhanced } from "../Voice/QuestionVoiceInputEnhanced"
import { FEATURES } from "../../config/features"

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

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

interface QuestionTextInputProps {
  question: {
    num1: number;
    num2: number;
    operator: string;
    answer: number;
  };
  onAnswer: (answer: number, typingData?: { count: number; time: number; inputMethod: 'voice' | 'keyboard' }) => void;
  showFeedback: boolean;
  enableVoice?: boolean; // New prop to enable voice input
}

export const QuestionTextInput: React.FC<QuestionTextInputProps> = ({ question, onAnswer, showFeedback, enableVoice = true }) => {
  const [value, setValue] = useState('');
  const [lastAnswer, setLastAnswer] = useState<number | null>(null);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Add refs for keystroke timing
  const firstKeystrokeTime = useRef<number | null>(null);
  const lastKeystrokeTime = useRef<number | null>(null);
  
  // Voice timing refs
  const voiceStartTime = useRef<number | null>(null);
  const voiceEndTime = useRef<number | null>(null);
  
  // Speech recognition ref
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // Check for Web Speech API support
  const checkSpeechSupport = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return !!SpeechRecognition;
  };

  const calculateTypingData = (isCorrect: boolean) => {
    const answerLength = question.answer.toString().length;
    
    // Always return data with input method for accuracy tracking
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
    
    // For 3-digit numbers, we have 2 inter-digit intervals, so divide by 2
    const averageTypingTime = answerLength === 3 ? totalTypingTime / 2 : totalTypingTime;

    return {
      count: 1, // Each answer counts as 1 attempt
      time: averageTypingTime,
      inputMethod: 'keyboard' as const
    };
  };

  const calculateVoiceData = (isCorrect: boolean) => {
    const answerLength = question.answer.toString().length;
    
    // Always return data with input method for accuracy tracking
    if (!isCorrect) {
      return {
        count: 1,
        time: 0,
        inputMethod: 'voice' as const
      };
    }

    if (answerLength <= 1 || !voiceStartTime.current || !voiceEndTime.current) {
      return {
        count: 1,
        time: 0,
        inputMethod: 'voice' as const
      };
    }

    const totalVoiceTime = voiceEndTime.current - voiceStartTime.current;
    
    return {
      count: 1,
      time: totalVoiceTime,
      inputMethod: 'voice' as const
    };
  };

  // Initialize speech recognition when component mounts
  useEffect(() => {
    if (enableVoice) {
      const supported = checkSpeechSupport();
      setSpeechSupported(supported);
      
      if (supported && !useTextFallback) {
        initializeSpeechRecognition();
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
    voiceStartTime.current = null;
    voiceEndTime.current = null;
  }, [question]);

  useEffect(() => {
    if ((useTextFallback || !enableVoice) && inputRef.current && !showFeedback) {
      inputRef.current.focus();
    }
  }, [showFeedback, useTextFallback, enableVoice]);

  const initializeSpeechRecognition = () => {
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setConnectionError('Speech recognition not supported in this browser');
        setUseTextFallback(true);
        return;
      }
      const recognition = new SpeechRecognition();
      
      // Configure recognition for continuous listening
      recognition.continuous = true;            // Keep listening across multiple questions
      recognition.interimResults = true;       // Get partial results for feedback
      recognition.maxAlternatives = 1;         // Only need the best match
      recognition.lang = 'en-US';              // English US for consistent number recognition
      
      // Set up event handlers
      recognition.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
        setConnectionError(null);
      };
      
      recognition.onresult = (event: ISpeechRecognitionEvent) => {
        const results = event.results;
        let latestTranscript = '';
        
        // Get the most recent result
        for (let i = event.resultIndex; i < results.length; i++) {
          const result = results[i];
          if (result[0]) {
            latestTranscript = result[0].transcript.trim();
            
            // Extract number from transcript
            const number = extractNumberFromSpeech(latestTranscript);
            if (number !== null) {
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
        console.error('Speech recognition error:', event.error);
        
        // Handle specific errors
        switch (event.error) {
          case 'no-speech':
            // Continue listening - this is expected in continuous mode
            break;
          case 'audio-capture':
            setConnectionError('Microphone access denied');
            setUseTextFallback(true);
            break;
          case 'not-allowed':
            setConnectionError('Microphone permission denied');
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
        console.log('Speech recognition ended, restarting...');
        setIsListening(false);
        
        // Auto-restart if we're not in text fallback mode and not showing feedback
        if (!useTextFallback && !showFeedback && enableVoice) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (error) {
              console.error('Failed to restart speech recognition');
            }
          }, 100);
        }
      };
      
      recognitionRef.current = recognition;
      
      // Start listening immediately
      if (!showFeedback) {
        recognition.start();
      }
      
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error);
      setConnectionError('Speech recognition initialization failed');
      setUseTextFallback(true);
    }
  };

  // Extract number from speech transcript
  const extractNumberFromSpeech = (transcript: string): number | null => {
    const cleanTranscript = transcript.toLowerCase().trim();
    
    // First try to match direct numbers (like "5", "42", "123")
    const directNumberMatch = cleanTranscript.match(/\b\d+\b/);
    if (directNumberMatch) {
      const num = parseInt(directNumberMatch[0]);
      if (!isNaN(num) && num >= 0 && num <= 999) { // Reasonable range for math answers
        return num;
      }
    }
    
    // Map word numbers to digits for common math answers
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
    
    // Handle compound numbers like "twenty five" or "forty two"
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
    
    voiceEndTime.current = Date.now();
    voiceStartTime.current = voiceStartTime.current || voiceEndTime.current - 1000; // Fallback timing
    
    const isCorrect = number === question.answer;
    setLastAnswer(question.answer);
    setWasCorrect(isCorrect);
    
    // Use voice timing data
    onAnswer(number, calculateVoiceData(isCorrect));
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
    setIsListening(false);
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
    if (!useTextFallback) return; // Only allow text input in fallback mode
    
    const isMultiDigitAnswer = question.answer.toString().length > 1;

    // Track keystroke timing for multi-digit answers
    if (isMultiDigitAnswer) {
      const now = Date.now();
      
      // Record first keystroke
      if (newValue.length === 1) {
        firstKeystrokeTime.current = now;
      }
      
      // Record subsequent keystrokes
      if (newValue.length > 0) {
        lastKeystrokeTime.current = now;
      }
    }

    setValue(newValue);

    // Auto-submit when input length matches answer length
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
    if (!useTextFallback) return; // Only allow text input in fallback mode
    
    const newValue = e.target.value.replace(/\D/g, '');
    handleInputChange(newValue);
  };

  const getVoiceStatusText = () => {
    if (!enableVoice) return '';
    if (connectionError) return 'Voice unavailable - using text';
    if (!speechSupported) return 'Speech not supported';
    if (isListening) return 'Listening...';
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
      if (isListening && !useTextFallback) {
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
              {isListening && (
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
                ? (isListening ? "Listening..." : "Voice") 
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

// Export QuestionVoiceInput as an alias for practice components
// Use the enhanced version if Deepgram feature is enabled
export const QuestionVoiceInput = FEATURES.VOICE_INPUT_DEEPGRAM 
  ? QuestionVoiceInputEnhanced 
  : QuestionTextInput;

export { Input }