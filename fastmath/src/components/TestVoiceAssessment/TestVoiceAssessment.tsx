import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import VoiceInputLiveKit from './VoiceInputLiveKit';
import { TouchpadInput } from '../ui/TouchpadInput';
import TestTimer from '../ui/TestTimer';
import { Button } from '../ui/button';
import { Mic, MicOff } from 'lucide-react';

interface Question {
  id: string;
  num1: number;
  num2: number;
  operator: string;
  answer: number;
}

interface PracticeResults {
  questionsAnswered: number;
  correctAnswers: number;
  timeElapsed: number;
  accuracy: number;
}

const TestVoiceAssessment: React.FC = () => {
  const navigate = useNavigate();
  
  // Test questions as requested
  const questions: Question[] = [
    { id: 'q1', num1: 5, num2: 8, operator: '+', answer: 13 },
    { id: 'q2', num1: 2, num2: 4, operator: '+', answer: 6 },
    { id: 'q3', num1: 10, num2: 8, operator: '+', answer: 18 },
    { id: 'q4', num1: 1, num2: 1, operator: '+', answer: 2 },
    { id: 'q5', num1: 3, num2: 6, operator: '+', answer: 9 }
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');
  
  const testStartTime = useRef<number>(Date.now());

  const currentQuestion = questions[currentIndex];

  const handleAnswer = (answer: number) => {
    const isCorrect = answer === currentQuestion.answer;
    setWasCorrect(isCorrect);
    setShowFeedback(true);
    setQuestionsAnswered(prev => prev + 1);
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
    }

    // Move to next question after feedback
    setTimeout(() => {
      setShowFeedback(false);
      setUserAnswer('');
      setTranscript('');
      
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        // Test completed
        handleTestComplete();
      }
    }, 1000);
  };

  const handleVoiceTranscript = (text: string) => {
    setTranscript(text);
    
    // Extract number from transcript
    const number = extractNumberFromSpeech(text);
    if (number !== null) {
      setUserAnswer(number.toString());
      handleAnswer(number);
    }
  };

  const extractNumberFromSpeech = (text: string): number | null => {
    const cleanText = text.toLowerCase().trim();
    
    // Direct number match
    const directMatch = cleanText.match(/\b\d+\b/);
    if (directMatch) {
      const num = parseInt(directMatch[0]);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        return num;
      }
    }
    
    // Word to number mapping
    const wordToNumber: { [key: string]: number } = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 
      'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 
      'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 
      'eighteen': 18, 'nineteen': 19, 'twenty': 20
    };
    
    for (const [word, num] of Object.entries(wordToNumber)) {
      if (cleanText.includes(word)) {
        return num;
      }
    }
    
    return null;
  };

  const handleTextInputChange = (value: string) => {
    setUserAnswer(value);
    
    // Auto-submit when length matches expected answer
    if (value.length === currentQuestion.answer.toString().length) {
      const numValue = parseInt(value);
      if (!isNaN(numValue)) {
        handleAnswer(numValue);
      }
    }
  };

  const handleTestComplete = () => {
    const timeElapsed = Date.now() - testStartTime.current;
    const accuracy = questionsAnswered > 0 
      ? Math.round((correctAnswers / questionsAnswered) * 100) 
      : 0;
    
    const results: PracticeResults = {
      questionsAnswered,
      correctAnswers,
      timeElapsed,
      accuracy
    };
    
    setIsCompleted(true);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setQuestionsAnswered(0);
    setCorrectAnswers(0);
    setShowFeedback(false);
    setWasCorrect(false);
    setUserAnswer('');
    setTranscript('');
    setIsCompleted(false);
    testStartTime.current = Date.now();
  };

  if (isCompleted) {
    const accuracy = Math.round((correctAnswers / questionsAnswered) * 100);
    const timeElapsed = Math.round((Date.now() - testStartTime.current) / 1000);
    
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
          <h2 className="text-3xl font-bold text-center mb-6">Test Complete!</h2>
          
          <div className="space-y-4 mb-8">
            <div className="text-center">
              <p className="text-gray-600">Questions Answered</p>
              <p className="text-2xl font-bold">{questionsAnswered}</p>
            </div>
            
            <div className="text-center">
              <p className="text-gray-600">Correct Answers</p>
              <p className="text-2xl font-bold text-green-600">{correctAnswers}</p>
            </div>
            
            <div className="text-center">
              <p className="text-gray-600">Accuracy</p>
              <p className="text-2xl font-bold">{accuracy}%</p>
            </div>
            
            <div className="text-center">
              <p className="text-gray-600">Time</p>
              <p className="text-2xl font-bold">{timeElapsed}s</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <Button 
              onClick={handleRestart}
              className="w-full"
              size="lg"
            >
              Try Again
            </Button>
            
            <Button 
              onClick={() => navigate('/')}
              variant="outline"
              className="w-full"
              size="lg"
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Voice Input Test Assessment</h1>
          <Button 
            onClick={() => navigate('/')}
            variant="outline"
          >
            Exit
          </Button>
        </div>

        {/* Progress */}
        <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Question {currentIndex + 1} of {questions.length}</span>
            <span>{correctAnswers} correct so far</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Main content */}
        <div className="bg-white rounded-lg shadow-md p-8">

          {/* Question display */}
          <div className="text-center mb-8">
            <p className="text-6xl font-bold text-gray-800">
              {currentQuestion.num1} {currentQuestion.operator} {currentQuestion.num2} = ?
            </p>
          </div>

          {/* Answer input area */}
          <div className="flex justify-center items-start gap-8">
            {/* Left side - Input display */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <input
                  type="text"
                  value={userAnswer}
                  readOnly
                  placeholder={voiceEnabled ? "Say your answer" : ""}
                  className={`
                    w-48 p-4 text-4xl font-bold text-center rounded-lg
                    border-4 outline-none transition-all duration-200
                    ${showFeedback
                      ? wasCorrect
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : voiceEnabled
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 bg-white'
                    }
                  `}
                />
                
                {showFeedback && !wasCorrect && (
                  <div className="absolute -right-20 top-1/2 -translate-y-1/2 text-green-500 font-bold text-2xl">
                    {currentQuestion.answer}
                  </div>
                )}
              </div>

              {/* Microphone toggle button - always visible */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  title={voiceEnabled ? "Voice input is ON" : "Voice input is OFF"}
                >
                  {voiceEnabled ? (
                    <>
                      <Mic className="w-4 h-4 text-blue-500" />
                      <span className="text-sm">Voice ON</span>
                    </>
                  ) : (
                    <>
                      <MicOff className="w-4 h-4 text-gray-500" />
                      <span className="text-sm">Voice OFF</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Voice status */}
              {voiceEnabled && (
                <div className="mt-4 text-center">
                  <VoiceInputLiveKit 
                    onTranscript={handleVoiceTranscript}
                    isActive={!showFeedback}
                  />
                  {transcript && (
                    <p className="mt-2 text-sm text-gray-600">
                      Heard: "{transcript}"
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Right side - Number pad (only when voice is disabled) */}
            {!voiceEnabled && (
              <TouchpadInput
                value={userAnswer}
                onChange={handleTextInputChange}
                disabled={showFeedback}
                showFeedback={showFeedback}
                wasCorrect={wasCorrect}
              />
            )}
          </div>

          {/* Feedback message */}
          {showFeedback && (
            <div className={`mt-6 text-center text-2xl font-bold ${wasCorrect ? 'text-green-600' : 'text-red-600'}`}>
              {wasCorrect ? '✓ Correct!' : '✗ Try again next time!'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestVoiceAssessment;