import React, { useState, useRef, useEffect } from 'react';
import { TouchpadInput } from '../ui/TouchpadInput';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { AudioLevelMeter } from './AudioLevelMeter';
import { FEATURES } from '../../config/features';

interface QuestionTextInputProps {
  question: {
    num1: number;
    num2: number;
    operator: string;
    answer: number;
  };
  onAnswer: (answer: number, typingData?: { count: number; time: number; inputMethod: 'voice' | 'keyboard' }) => void;
  showFeedback: boolean;
  enableVoice?: boolean;
}

export const QuestionVoiceInputEnhanced: React.FC<QuestionTextInputProps> = ({ 
  question, 
  onAnswer, 
  showFeedback, 
  enableVoice = true 
}) => {
  const [value, setValue] = useState('');
  const [lastAnswer, setLastAnswer] = useState<number | null>(null);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [useTextFallback, setUseTextFallback] = useState(!enableVoice);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Keystroke timing refs
  const firstKeystrokeTime = useRef<number | null>(null);
  const lastKeystrokeTime = useRef<number | null>(null);
  
  // Voice timing refs
  const voiceStartTime = useRef<number | null>(null);
  const transcriptionReceived = useRef<boolean>(false);

  // Use the new voice input hook
  const {
    isListening,
    audioLevel,
    latency,
    error: voiceHookError,
    startVoiceInput,
    stopVoiceInput
  } = useVoiceInput({
    onTranscription: (text: string, isFinal: boolean) => {
      // Mark that we received a transcription
      if (!transcriptionReceived.current) {
        voiceStartTime.current = Date.now() - (latency || 0);
        transcriptionReceived.current = true;
      }

      const number = extractNumberFromSpeech(text);
      if (number !== null) {
        setValue(number.toString());
        
        if (isFinal && enableVoice && !useTextFallback) {
          processVoiceAnswer(number);
        }
      }
    },
    onError: (error) => {
      console.error('Voice input error:', error);
      setVoiceError(error.message);
      // Don't automatically fall back - let user decide
    },
    onAudioLevel: (level) => {
      // Audio level is handled by the hook
    }
  });

  // Initialize voice on mount if enabled
  useEffect(() => {
    if (enableVoice && FEATURES.VOICE_INPUT_DEEPGRAM && !showFeedback && !useTextFallback) {
      // Auto-start voice input when component mounts
      startVoiceInput().catch(err => {
        console.error('Failed to start voice input:', err);
        setVoiceError('Failed to start voice input');
      });
    }
    
    return () => {
      if (isListening) {
        stopVoiceInput();
      }
    };
  }, [enableVoice, showFeedback, useTextFallback]);

  // Reset state when question changes
  useEffect(() => {
    setValue('');
    setLastAnswer(null);
    setWasCorrect(false);
    setVoiceError(null);
    firstKeystrokeTime.current = null;
    lastKeystrokeTime.current = null;
    voiceStartTime.current = null;
    transcriptionReceived.current = false;
  }, [question]);

  // Focus input when in text mode
  useEffect(() => {
    if (useTextFallback && inputRef.current && !showFeedback) {
      inputRef.current.focus();
    }
  }, [showFeedback, useTextFallback]);

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
    const compoundMatches = [
      { regex: /twenty[- ]?(\w+)/, base: 20 },
      { regex: /thirty[- ]?(\w+)/, base: 30 },
      { regex: /forty[- ]?(\w+)/, base: 40 },
      { regex: /fifty[- ]?(\w+)/, base: 50 },
      { regex: /sixty[- ]?(\w+)/, base: 60 },
      { regex: /seventy[- ]?(\w+)/, base: 70 },
      { regex: /eighty[- ]?(\w+)/, base: 80 },
      { regex: /ninety[- ]?(\w+)/, base: 90 }
    ];

    for (const { regex, base } of compoundMatches) {
      const match = cleanTranscript.match(regex);
      if (match && match[1] && wordToNumber[match[1]]) {
        return base + wordToNumber[match[1]];
      }
    }
    
    return null;
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

  const calculateVoiceData = (isCorrect: boolean) => {
    if (!isCorrect) {
      return {
        count: 1,
        time: 0,
        inputMethod: 'voice' as const
      };
    }

    // Use the latency reported by the voice system
    return {
      count: 1,
      time: latency || 0,
      inputMethod: 'voice' as const
    };
  };

  const processVoiceAnswer = (number: number) => {
    if (showFeedback) return;
    
    const isCorrect = number === question.answer;
    setLastAnswer(question.answer);
    setWasCorrect(isCorrect);
    
    onAnswer(number, calculateVoiceData(isCorrect));
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
    if (!useTextFallback) return;
    
    const newValue = e.target.value.replace(/\D/g, '');
    handleInputChange(newValue);
  };

  const getVoiceStatusText = () => {
    if (!enableVoice || !FEATURES.VOICE_INPUT_DEEPGRAM) return '';
    if (voiceError) return 'Voice error - using keyboard';
    if (isListening) return `Listening... ${latency ? `(${latency}ms)` : ''}`;
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

  const handleToggleFallback = () => {
    if (isListening) {
      stopVoiceInput();
    }
    setUseTextFallback(!useTextFallback);
    setVoiceError(null);
    
    if (!useTextFallback && enableVoice && FEATURES.VOICE_INPUT_DEEPGRAM) {
      startVoiceInput().catch(err => {
        console.error('Failed to restart voice input:', err);
        setVoiceError('Failed to restart voice input');
        setUseTextFallback(true);
      });
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
          {enableVoice && FEATURES.VOICE_INPUT_DEEPGRAM && !useTextFallback && (
            <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 text-sm text-gray-600 w-48">
              <div className="text-center">{getVoiceStatusText()}</div>
              {isListening && (
                <AudioLevelMeter level={audioLevel} isListening={isListening} />
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
            disabled={showFeedback || (!useTextFallback && enableVoice && FEATURES.VOICE_INPUT_DEEPGRAM)}
            readOnly={!useTextFallback && enableVoice && FEATURES.VOICE_INPUT_DEEPGRAM}
            placeholder={
              !useTextFallback && enableVoice && FEATURES.VOICE_INPUT_DEEPGRAM
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
          {enableVoice && FEATURES.VOICE_INPUT_DEEPGRAM && (voiceError || FEATURES.VOICE_INPUT_FALLBACK) && (
            <button
              onClick={handleToggleFallback}
              className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-xs text-blue-600 hover:text-blue-800"
            >
              {useTextFallback ? 'Use voice input' : 'Use keyboard'}
            </button>
          )}
        </div>
      </div>

      {/* Right side - Touchpad (only show when using text input) */}
      {useTextFallback && (
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