import React, { useState, useEffect, useRef } from 'react';
import { QuestionTextInput } from './input';

interface CorrectAnswerInputProps {
  correctAnswer: number;
  onCorrectInput: () => void;
  question: {
    num1: number;
    num2: number;
    operator: string;
  };
}

// Custom component to display the feedback state
const InputFeedback = ({ isVisible, isCorrect, value }: { isVisible: boolean; isCorrect: boolean; value: string }) => {
  if (!isVisible) return null;
  
  // Exactly match the original input's styles
  const colorClasses = isCorrect 
    ? 'border-green-500 bg-green-50 text-green-700'
    : 'border-red-500 bg-red-50 text-red-700';
  
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className={`
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
        ${colorClasses}
      `}>
        {value}
      </div>
    </div>
  );
};

const CorrectAnswerInput: React.FC<CorrectAnswerInputProps> = ({ correctAnswer, onCorrectInput, question }) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [lastInput, setLastInput] = useState<number | null>(null);
  const [isLastInputCorrect, setIsLastInputCorrect] = useState(false);
  
  // Use refs to properly handle the asynchronous nature of timeouts
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Clear any pending timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  const questionWithAnswer = {
    ...question,
    answer: correctAnswer
  };

  const handleAnswer = (answer: number) => {
    // Store the last input for feedback display
    setLastInput(answer);
    
    const isCorrect = answer === correctAnswer;
    setIsLastInputCorrect(isCorrect);
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Show feedback immediately
    setShowFeedback(true);
    
    if (isCorrect) {
      // For correct answers, show feedback briefly then continue
      timeoutRef.current = setTimeout(() => {
        setShowFeedback(false);
        onCorrectInput();
      }, 200); // Match QuestionScreen timing (200ms)
    } else {
      // For incorrect answers, show feedback briefly then reset
      timeoutRef.current = setTimeout(() => {
        setShowFeedback(false);
        // Increment after feedback is hidden
        setFeedbackKey(prev => prev + 1);
      }, 200); // Match QuestionScreen timing (200ms)
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-6">
      {/* Single equation display with correct answer */}
      <div className="w-full text-center">
        <div className="text-5xl font-bold text-gray-800 flex items-center justify-center gap-4">
          <span>{question.num1}</span>
          <span>{question.operator}</span>
          <span>{question.num2}</span>
          <span>=</span>
          <span className="text-blue-600">{correctAnswer}</span>
        </div>
      </div>

      {/* Feedback Message */}
      <div className="text-center">
        <p className="text-red-600 font-semibold text-xl mb-2">Your answer is incorrect</p>
        <p className="text-gray-600 text-lg">Type the correct answer to continue</p>
      </div>
      
      {/* Practice section with input */}
      <div className="w-full rounded-lg bg-gray-50 p-6 border border-gray-100 relative">
        {/* Only show the QuestionTextInput when not showing feedback */}
        <div className={showFeedback ? 'opacity-0' : ''}>
          <QuestionTextInput
            key={feedbackKey}
            question={questionWithAnswer}
            onAnswer={handleAnswer}
            showFeedback={false} // Never show the internal feedback, we handle it ourselves
          />
        </div>
        
        {/* Custom overlay feedback to ensure visibility */}
        {lastInput !== null && (
          <InputFeedback 
            isVisible={showFeedback}
            isCorrect={isLastInputCorrect}
            value={lastInput.toString()}
          />
        )}
      </div>
    </div>
  );
};

export default CorrectAnswerInput; 