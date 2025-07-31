import React, { useState, useEffect } from 'react';
import { DualVoiceInputV3, TranscriptionData } from './DualVoiceInputV3';
import { TranscriptionResults, TranscriptionData as ResultData } from './TranscriptionResults';
import Timer from './Timer';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface MathProblem {
  id: string;
  num1: number;
  num2: number;
  operator: '+';
  answer: number;
  timeLimit: number;
}

interface ExerciseSession {
  sessionId: string;
  problems: MathProblem[];
  createdAt: string;
}

interface ProblemResult {
  problemId: string;
  userAnswer: number;
  isCorrect: boolean;
  responseTime: number;
  inputMethod: 'voice' | 'keyboard';
}

export const VoiceExerciseWithComparison: React.FC = () => {
  const [session, setSession] = useState<ExerciseSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<ProblemResult[]>([]);
  const [transcriptionResults, setTranscriptionResults] = useState<ResultData[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [problemStartTime, setProblemStartTime] = useState(Date.now());
  const [sessionComplete, setSessionComplete] = useState(false);
  const [servicesReady, setServicesReady] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);

  // Initialize session on mount
  useEffect(() => {
    fetchNewSession();
  }, []);

  const fetchNewSession = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/exercise/session/new`);
      setSession(response.data);
      setCurrentIndex(0);
      setResults([]);
      setTranscriptionResults([]);
      setSessionComplete(false);
      setProblemStartTime(Date.now());
    } catch (error) {
      console.error('Error fetching session:', error);
    }
  };

  const handleServicesReady = (webSpeechReady: boolean, deepgramReady: boolean) => {
    const bothReady = webSpeechReady && deepgramReady;
    setServicesReady(bothReady);
    
    // Start timer only when both services are ready and we haven't started yet
    if (bothReady && !timerStarted && !showFeedback) {
      setProblemStartTime(Date.now());
      setTimerStarted(true);
      console.log('⏱️ Both services ready - starting timer');
    }
  };

  const handleAnswer = async (
    answer: number, 
    typingData?: { count: number; time: number; inputMethod: 'voice' | 'keyboard' },
    transcriptionData?: TranscriptionData
  ) => {
    if (!session || showFeedback) return;

    const currentProblem = session.problems[currentIndex];
    const responseTime = Date.now() - problemStartTime;
    const correct = answer === currentProblem.answer;

    setIsCorrect(correct);
    setShowFeedback(true);

    // Record result
    const result: ProblemResult = {
      problemId: currentProblem.id,
      userAnswer: answer,
      isCorrect: correct,
      responseTime,
      inputMethod: typingData?.inputMethod || 'keyboard'
    };

    setResults([...results, result]);

    // Record transcription data if voice was used
    if (typingData?.inputMethod === 'voice' && transcriptionData) {
      const transcriptionResult: ResultData = {
        problem: `${currentProblem.num1} + ${currentProblem.num2}`,
        correctAnswer: currentProblem.answer,
        webSpeechTranscript: transcriptionData.webSpeechTranscript,
        deepgramTranscript: transcriptionData.deepgramTranscript,
        webSpeechLatency: transcriptionData.webSpeechLatency,
        deepgramLatency: transcriptionData.deepgramLatency
      };
      setTranscriptionResults([...transcriptionResults, transcriptionResult]);
    }

    // Send result to backend
    try {
      await axios.post(`${API_URL}/api/exercise/session/${session.sessionId}/result`, {
        problemId: currentProblem.id,
        userAnswer: answer,
        voiceMetrics: {
          inputMethod: typingData?.inputMethod,
          responseTime,
          transcriptionData: transcriptionData
        }
      });
    } catch (error) {
      console.error('Error saving result:', error);
    }

    // Auto-advance after feedback
    setTimeout(() => {
      if (currentIndex < session.problems.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setShowFeedback(false);
        setProblemStartTime(Date.now());
        setServicesReady(false);
        setTimerStarted(false);
      } else {
        setSessionComplete(true);
      }
    }, 1500);
  };

  const handleTimeout = () => {
    if (!showFeedback && session) {
      handleAnswer(-1); // -1 indicates timeout
    }
  };

  if (!session) {
    return <div className="flex items-center justify-center h-screen">Loading session...</div>;
  }

  if (sessionComplete) {
    const correctCount = results.filter(r => r.isCorrect).length;
    const voiceCount = results.filter(r => r.inputMethod === 'voice').length;
    
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-8">Session Complete!</h1>
            <div className="text-2xl space-y-4 mb-8">
              <p>Correct: {correctCount} / {session.problems.length}</p>
              <p>Voice Inputs: {voiceCount} / {session.problems.length}</p>
            </div>
            <button
              onClick={fetchNewSession}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-xl"
            >
              Start New Session
            </button>
          </div>
          
          {/* Show transcription comparison results */}
          <TranscriptionResults 
            results={transcriptionResults}
            sessionComplete={sessionComplete}
          />
        </div>
      </div>
    );
  }

  const currentProblem = session.problems[currentIndex];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm text-gray-600">
              Problem {currentIndex + 1} of {session.problems.length}
            </span>
            <span className="text-sm text-gray-600">
              Dual Voice Input Test (Web Speech API + Deepgram)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / session.problems.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Timer */}
        {!showFeedback && (
          <div className="mb-8">
            <div className="flex justify-center">
              {servicesReady ? (
                <Timer
                  duration={currentProblem.timeLimit}
                  onTimeout={handleTimeout}
                  key={`timer-${currentProblem.id}-${timerStarted}`}
                />
              ) : (
                <div className="text-2xl font-semibold text-gray-600">
                  {currentProblem.timeLimit}s
                </div>
              )}
            </div>
            {!servicesReady && (
              <p className="text-center text-sm text-orange-600 mt-2">
                Waiting for services to connect...
              </p>
            )}
          </div>
        )}

        {/* Main exercise area */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <DualVoiceInputV3
            question={{
              num1: currentProblem.num1,
              num2: currentProblem.num2,
              operator: currentProblem.operator,
              answer: currentProblem.answer
            }}
            onAnswer={handleAnswer}
            showFeedback={showFeedback}
            enableVoice={true}
            onServicesReady={handleServicesReady}
          />

          {/* Feedback display */}
          {showFeedback && (
            <div className="mt-8 text-center">
              <p className={`text-3xl font-bold ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
              </p>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 text-center text-gray-600">
          <p>Say your answer out loud or type it in</p>
          <p className="text-sm mt-2">Both Web Speech API and Deepgram are listening</p>
        </div>
      </div>
    </div>
  );
};