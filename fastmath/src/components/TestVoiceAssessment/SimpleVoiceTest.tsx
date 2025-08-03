import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TouchpadInput } from '../ui/TouchpadInput';
import { Button } from '../ui/button';
import VoiceInputLiveKit from './VoiceInputLiveKit';
import { Mic, MicOff } from 'lucide-react';
import { BorderTrail } from '../ui/border-trail';

interface Question {
  id: string;
  num1: number;
  num2: number;
  operator: string;
  answer: number;
}

const SimpleVoiceTest: React.FC = () => {
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
  const [isReady, setIsReady] = useState(false);
  const [lastTranscriptTime, setLastTranscriptTime] = useState(0);
  const [autoSubmitTimer, setAutoSubmitTimer] = useState<NodeJS.Timeout | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const currentQuestion = questions[currentIndex] || questions[0]; // Fallback to prevent undefined

  const handleAnswer = (answer: number) => {
    // Clear any pending auto-submit timer
    if (autoSubmitTimer) {
      clearTimeout(autoSubmitTimer);
      setAutoSubmitTimer(null);
    }
    
    // Show processing state
    setIsProcessing(true);
    
    // Simulate minimal processing time for visual feedback
    setTimeout(() => {
      const isCorrect = answer === currentQuestion.answer;
      console.log(`🔍 [SimpleVoiceTest] Validation: ${answer} === ${currentQuestion.answer} ? ${isCorrect} (Question: ${currentQuestion.num1} ${currentQuestion.operator} ${currentQuestion.num2})`);
      setWasCorrect(isCorrect);
      setShowFeedback(true);
      setIsProcessing(false);
      setQuestionsAnswered(prev => prev + 1);
      
      if (isCorrect) {
        setCorrectAnswers(prev => prev + 1);
      }

      // Move to next question after minimal feedback
      setTimeout(() => {
        console.log(`📊 [SimpleVoiceTest] Moving to next: currentIndex=${currentIndex}, questions.length=${questions.length}`);
        if (currentIndex >= questions.length - 1) {
          // Test completed
          console.log(`🎉 [SimpleVoiceTest] Test completed!`);
          setIsCompleted(true);
        } else {
          setShowFeedback(false);
          setUserAnswer('');
          setTranscript('');
          setQuestionStartTime(Date.now()); // Record when new question starts
          setCurrentIndex(prev => {
            const next = prev + 1;
            console.log(`➡️ [SimpleVoiceTest] Moving from question ${prev + 1} to ${next + 1}`);
            return next;
          });
        }
      }, 300); // Reduced from 1000ms to 300ms for faster flow
    }, 100); // Small delay to show processing animation
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

  const handleRestart = () => {
    // Clear any pending timers
    if (autoSubmitTimer) {
      clearTimeout(autoSubmitTimer);
      setAutoSubmitTimer(null);
    }
    
    setCurrentIndex(0);
    setQuestionsAnswered(0);
    setCorrectAnswers(0);
    setShowFeedback(false);
    setWasCorrect(false);
    setUserAnswer('');
    setTranscript('');
    setIsCompleted(false);
    setIsProcessing(false);
    setQuestionStartTime(Date.now()); // Reset question start time
  };

  const handleConnectionStatus = (connected: boolean) => {
    console.log('[SimpleVoiceTest] Connection status:', connected);
    if (connected && !isReady) {
      setIsReady(true);
      setQuestionStartTime(Date.now()); // Set start time when assessment begins
    }
  };

  const handleVoiceTranscript = (text: string, speechFinal?: boolean, timestamp?: number) => {
    const transcriptTime = timestamp || Date.now();
    console.log(`📝 [SimpleVoiceTest] Received transcript: "${text}", speechFinal: ${speechFinal}, timestamp: ${transcriptTime}, questionStartTime: ${questionStartTime}, showFeedback: ${showFeedback}, isCompleted: ${isCompleted}`);
    
    // Don't process if test is completed
    if (isCompleted) {
      console.log(`🏁 [SimpleVoiceTest] Ignoring transcript - test completed`);
      return;
    }
    
    // Ignore transcriptions from before the current question started
    if (transcriptTime < questionStartTime) {
      console.log(`⏮️ [SimpleVoiceTest] Ignoring old transcript from before current question (${transcriptTime} < ${questionStartTime})`);
      return;
    }
    
    // The text coming from VoiceInputLiveKit is already a number string
    // Don't process if we're showing feedback
    if (showFeedback) {
      console.log(`⏸️ [SimpleVoiceTest] Ignoring transcript - showing feedback`);
      return;
    }
    
    // Validate it's a number
    const number = parseInt(text);
    if (!isNaN(number) && number >= 0 && number <= 100) {
      setUserAnswer(text);
      console.log(`✅ [SimpleVoiceTest] Valid number: ${number}, expected answer: ${currentQuestion.answer}`);
      
      // Clear any existing auto-submit timer
      if (autoSubmitTimer) {
        clearTimeout(autoSubmitTimer);
        setAutoSubmitTimer(null);
      }
      
      // Auto-submit when speechFinal is true (user stopped speaking)
      if (speechFinal === true) {
        console.log(`🏁 [SimpleVoiceTest] Auto-submitting on speechFinal: ${number}`);
        handleAnswer(number);
      } else {
        console.log(`⏳ [SimpleVoiceTest] Setting auto-submit timer (800ms)...`);
        // Set a timer to auto-submit after 800ms of no new transcripts
        const timer = setTimeout(() => {
          console.log(`⏰ [SimpleVoiceTest] Auto-submit timer fired for: ${number}`);
          handleAnswer(number);
        }, 800);
        setAutoSubmitTimer(timer);
      }
      
      setLastTranscriptTime(Date.now());
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

  if (isCompleted) {
    const accuracy = Math.round((correctAnswers / questionsAnswered) * 100);
    
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

  // Ready screen before assessment starts
  if (!isReady && voiceEnabled) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <h2 className="text-3xl font-bold mb-6">Get Ready!</h2>
          
          <div className="mb-8">
            <div className="text-6xl mb-4">🎤</div>
            <p className="text-lg text-gray-600 mb-4">Connecting voice recognition...</p>
            
            {/* Voice connection status */}
            <VoiceInputLiveKit 
              onTranscript={handleVoiceTranscript}
              isActive={true}
              onConnectionChange={handleConnectionStatus}
            />
          </div>
          
          <p className="text-sm text-gray-500">
            The assessment will begin automatically once connected.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Simple Voice Test Assessment</h1>
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
            <span>Question {Math.min(currentIndex + 1, questions.length)} of {questions.length}</span>
            <span>{correctAnswers} correct so far</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(Math.min(currentIndex + 1, questions.length) / questions.length) * 100}%` }}
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
                  placeholder={voiceEnabled ? "Say your answer" : "Use number pad"}
                  className={`
                    w-48 p-4 text-4xl font-bold text-center rounded-lg
                    outline-none transition-all duration-200
                    ${showFeedback
                      ? wasCorrect
                        ? 'border-4 border-green-500 bg-green-50 text-green-700'
                        : 'border-4 border-red-500 bg-red-50 text-red-700'
                      : voiceEnabled
                        ? 'border-4 border-blue-500 bg-blue-50'
                        : 'border-4 border-gray-300 bg-white'
                    }
                  `}
                />
                {isProcessing && (
                  <BorderTrail
                    className="bg-gradient-to-l from-blue-300 via-purple-500 to-blue-300"
                    size={60}
                    transition={{
                      ease: [0, 0.5, 0.8, 0.5],
                      duration: 1.5,
                      repeat: Infinity,
                    }}
                  />
                )}
                
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
              {voiceEnabled && !isCompleted && (
                <div className="mt-4 text-center">
                  <VoiceInputLiveKit 
                    onTranscript={handleVoiceTranscript}
                    isActive={!showFeedback}
                    onConnectionChange={handleConnectionStatus}
                  />
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

          {/* Instructions */}
          <div className="mt-8 text-center text-gray-600">
            <p>This is a test of the voice assessment interface using LiveKit + Deepgram.</p>
            <p className="text-sm mt-2">
              {voiceEnabled ? "Speak your answer clearly. The system will recognize numbers." : "Use the number pad to enter your answer."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleVoiceTest;