import { useState, useRef, useEffect } from "react"
import { TouchpadInput } from "../ui/TouchpadInput";

interface FluencyTextInputProps {
  question: {
    num1: number;
    num2: number;
    operator: string;
    answer: number;
  };
  onAnswer: (answer: number) => void;
  showFeedback: boolean;
  isCorrect: boolean; // Explicitly pass whether the answer was correct
  timerKey?: number; // Add timerKey prop to detect timer changes
}

export const FluencyTextInput: React.FC<FluencyTextInputProps> = ({ 
  question, 
  onAnswer, 
  showFeedback,
  isCorrect,
  timerKey
}) => {
  const [value, setValue] = useState('');
  const [userAnswer, setUserAnswer] = useState<string>(''); // Store the user's actual answer
  const [lastAnswer, setLastAnswer] = useState<number | null>(null);
  const [lastQuestionId, setLastQuestionId] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFeedbackRef = useRef(showFeedback);

  // Create a compound ID for the question to detect actual question changes
  const questionId = `${question.num1}${question.operator}${question.num2}`;

  // Reset input only when question actually changes - not on timer zone changes
  useEffect(() => {
    const isNewQuestion = questionId !== lastQuestionId;
    
    if (isNewQuestion && !showFeedback) {
      setValue('');
      setUserAnswer('');
      setLastAnswer(null);
      setLastQuestionId(questionId);
    }
  }, [questionId, lastQuestionId, showFeedback]);

  // Handle feedback state transitions
  useEffect(() => {
    // When feedback is hidden (going from showing feedback to not showing)
    // This means we're likely moving to a new question or resetting after an answer
    if (previousFeedbackRef.current && !showFeedback) {
      setValue('');
      setUserAnswer('');
    }
    
    previousFeedbackRef.current = showFeedback;
  }, [showFeedback]);

  // Focus input when not showing feedback
  useEffect(() => {
    if (inputRef.current && !showFeedback) {
      inputRef.current.focus();
    }
  }, [showFeedback]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!value || showFeedback) return;

    const numValue = parseInt(value);
    if (!isNaN(numValue)) {
      // Store the user's answer for display during feedback
      setUserAnswer(value);
      setLastAnswer(question.answer);
      onAnswer(numValue);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handleInputChange = (newValue: string) => {
    setValue(newValue);

    // Auto-submit when input length matches answer length
    if (newValue.length === question.answer.toString().length) {
      const numValue = parseInt(newValue);
      if (!isNaN(numValue)) {
        // Store the user's answer for display during feedback
        setUserAnswer(newValue);
        setLastAnswer(question.answer);
        onAnswer(numValue);
      }
    }
  };

  const handleNativeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.replace(/\D/g, '');
    handleInputChange(newValue);
  };

  // Determine what value to display in the input box
  const displayValue = showFeedback ? userAnswer : value;

  return (
    <div className="flex justify-between">
      {/* Left side - Question and input */}
      <div className="flex flex-col items-center justify-center flex-1">
        <p className="text-6xl font-bold text-gray-800 mb-8">
          {question.num1} {question.operator} {question.num2} = ?
        </p>

        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            value={displayValue}
            onChange={handleNativeInputChange}
            onKeyPress={handleKeyPress}
            disabled={showFeedback}
            className={`
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
              ${!showFeedback 
                ? 'border-gray-200 focus:border-gray-200 bg-white text-gray-700'
                : isCorrect
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-red-500 bg-red-50 text-red-700'
              }
            `}
          />
          
          {showFeedback && !isCorrect && (
            <div className="absolute -right-20 top-1/2 -translate-y-1/2 text-green-500 font-bold text-2xl">
              {question.answer}
            </div>
          )}
        </div>
      </div>

      {/* Right side - Touchpad */}
      <TouchpadInput
        value={value}
        onChange={handleInputChange}
        disabled={showFeedback}
        showFeedback={showFeedback}
        wasCorrect={isCorrect}
      />
    </div>
  );
};

export default FluencyTextInput;