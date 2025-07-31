# Speech Test Implementation Plan

## Overview
This plan details how to create a `voice_test` directory that extracts key components from the FastMath system to build a focused voice input test application for single-digit addition problems. The implementation will demonstrate both Web Speech API and Deepgram integration for real-time voice recognition during timed math exercises.

## Architecture Summary

### Core Components to Extract

#### 1. Frontend Components
- **QuestionTextInput** (`src/components/ui/input.tsx`): Already has voice input implementation
- **Timer** (`src/components/ui/Timer.tsx`): Individual problem timer with green/yellow zones
- **TouchpadInput** (`src/components/ui/TouchpadInput.tsx`): Fallback input method
- **TimedPracticePage** (`src/components/Learn/TimedPracticePage.tsx`): Exercise flow logic

#### 2. Backend Services
- **Session Management** (`src/services/sessionManagementService.ts`): Exercise generation logic
- **User Progress Service** (`src/services/userProgressService.ts`): Progress tracking
- **Types and Models** (`src/types/`): Core data structures

#### 3. API Routes
- **Session Routes** (`src/routes/sessionManagement.ts`): Exercise fetching
- **Progress Routes** (`src/routes/users.ts`): Progress updates
- **Voice Routes** (NEW): Deepgram WebSocket handling

## Voice Test Directory Structure

```
voice_test/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VoiceExercise.tsx       # Main exercise component
│   │   │   ├── VoiceInput.tsx          # Extracted voice input logic
│   │   │   ├── Timer.tsx               # Timer component
│   │   │   └── ResultDisplay.tsx       # Show results/feedback
│   │   ├── services/
│   │   │   ├── voiceService.ts         # Voice input service layer
│   │   │   ├── deepgramService.ts      # Deepgram implementation
│   │   │   └── webSpeechService.ts     # Web Speech API implementation
│   │   ├── types/
│   │   │   └── index.ts                # Core types
│   │   ├── App.tsx                     # Main app component
│   │   └── index.tsx                   # Entry point
│   ├── package.json
│   └── tsconfig.json
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── exercise.ts             # Exercise generation
│   │   │   └── voice.ts                # Voice/Deepgram endpoints
│   │   ├── services/
│   │   │   ├── exerciseService.ts      # Simple exercise logic
│   │   │   └── deepgramWebSocket.ts    # Deepgram WS handler
│   │   ├── types/
│   │   │   └── index.ts                # Shared types
│   │   └── server.ts                   # Express server
│   ├── package.json
│   └── tsconfig.json
└── README.md                           # Setup instructions

```

## Key Implementation Details

### 1. Voice Input Service Layer

```typescript
// frontend/src/services/voiceService.ts
interface VoiceInputProvider {
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  pauseListening(): void;
  resumeListening(): void;
  onResult: (transcript: string) => void;
  onError: (error: Error) => void;
  getMetrics(): VoiceMetrics;
  isActive: boolean;
}

interface VoiceMetrics {
  provider: 'deepgram' | 'webspeech';
  latency: number;
  confidence?: number;
  startTime: number;
  endTime: number;
  finalTranscript: string;
  problemId: string;
  sessionId: string;
}
```

### 2. Exercise Data Model

```typescript
// Simplified from FastMath types
interface MathProblem {
  id: string;
  num1: number;
  num2: number;
  operator: '+';  // Single digit addition only
  answer: number;
  timeLimit: number; // seconds
}

interface ExerciseSession {
  sessionId: string;
  problems: MathProblem[];
  currentIndex: number;
  voiceProvider: 'deepgram' | 'webspeech';
  results: ProblemResult[];
}

interface ProblemResult {
  problemId: string;
  userAnswer: number;
  isCorrect: boolean;
  responseTime: number;
  inputMethod: 'voice' | 'keyboard';
  voiceMetrics?: VoiceMetrics;
}
```

### 3. Core Voice Input Component

The voice input component will be extracted from `QuestionTextInput` with these key features:

```typescript
// frontend/src/components/VoiceInput.tsx
const VoiceInput: React.FC<VoiceInputProps> = ({ 
  problem, 
  onAnswer, 
  provider = 'webspeech' 
}) => {
  // Extract core voice logic from input.tsx
  // Key features:
  // - Continuous listening across problems
  // - Number extraction from speech
  // - Auto-submit on recognition
  // - Fallback to keyboard input
  // - Visual feedback (listening indicator)
}
```

### 4. Exercise Flow

```typescript
// frontend/src/components/VoiceExercise.tsx
const VoiceExercise: React.FC = () => {
  // State management
  const [session, setSession] = useState<ExerciseSession>();
  const [currentProblem, setCurrentProblem] = useState<MathProblem>();
  const [showFeedback, setShowFeedback] = useState(false);
  
  // Voice service initialization
  useEffect(() => {
    // Initialize voice service at session start
    // Maintain connection throughout session
  }, []);
  
  // Problem flow
  const handleAnswer = (answer: number, metrics: VoiceMetrics) => {
    // Record result
    // Show feedback
    // Auto-advance to next problem
  };
}
```

### 5. Backend API Endpoints

```typescript
// backend/src/routes/exercise.ts
router.get('/session/new', (req, res) => {
  // Generate 10 single-digit addition problems
  const problems = generateAdditionProblems(10);
  res.json({ sessionId, problems });
});

router.post('/session/:sessionId/result', (req, res) => {
  // Store problem result with voice metrics
  const { problemId, answer, voiceMetrics } = req.body;
  // Save to memory/database
});

// backend/src/routes/voice.ts
router.post('/deepgram/token', (req, res) => {
  // Generate temporary Deepgram auth token
});

router.ws('/deepgram/stream', (ws) => {
  // WebSocket handler for audio streaming
  // Forward to Deepgram API
  // Return transcripts to client
});
```

### 6. Deepgram Configuration

```typescript
// backend/src/services/deepgramWebSocket.ts
const deepgramConfig = {
  model: 'nova-2-numerics', // Optimized for numbers
  language: 'en-US',
  punctuate: false,
  numerals: true,
  endpointing: 300, // ms of silence
  vad_events: true,
  interim_results: true,
  keep_alive: true
};
```

## Key Features to Implement

### 1. Continuous Voice Recognition
- Maintain active voice connection throughout session
- Pause during feedback display
- Resume for next problem
- Handle reconnection on failure

### 2. Timer Integration
- Visual timer (green → yellow → red zones)
- 6-second default for single-digit addition
- Auto-submit on timeout
- Voice latency consideration

### 3. Dual Input Support
- Voice as primary input
- Keyboard/touchpad fallback
- Seamless switching between modes
- Clear mode indicators

### 4. Real-time Feedback
- Immediate visual feedback on answer
- Correct answer display for incorrect responses
- Auto-advance after 1.5 seconds
- Progress tracking

### 5. Metrics Collection
- Voice recognition latency
- Accuracy rates
- Provider comparison (Deepgram vs Web Speech)
- Session completion rates

## Implementation Steps

### Phase 1: Core Setup (Day 1)
1. Create directory structure
2. Extract and simplify types/models
3. Set up basic Express server
4. Create React app skeleton

### Phase 2: Voice Integration (Day 2)
1. Extract voice logic from QuestionTextInput
2. Implement Web Speech API service
3. Create voice input component
4. Test basic number recognition

### Phase 3: Exercise Flow (Day 3)
1. Build exercise generation logic
2. Implement problem presentation
3. Add timer functionality
4. Create feedback system

### Phase 4: Deepgram Integration (Day 4)
1. Set up WebSocket server
2. Implement Deepgram service
3. Add provider switching
4. Test streaming recognition

### Phase 5: Polish & Testing (Day 5)
1. Add metrics collection
2. Implement results display
3. Handle edge cases
4. Performance optimization

## Configuration Files

### Frontend package.json
```json
{
  "name": "voice-test-frontend",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "axios": "^1.6.0",
    "framer-motion": "^10.16.0",
    "tailwindcss": "^3.3.0"
  }
}
```

### Backend package.json
```json
{
  "name": "voice-test-backend",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.0",
    "express-ws": "^5.0.0",
    "typescript": "^5.0.0",
    "@deepgram/sdk": "^3.0.0",
    "cors": "^2.8.5"
  }
}
```

## Testing Strategy

### 1. Unit Tests
- Number extraction from speech
- Timer behavior
- State management

### 2. Integration Tests
- End-to-end voice flow
- Provider switching
- Error recovery

### 3. Performance Tests
- Latency measurements
- Concurrent user support
- Audio quality handling

## Success Criteria

1. **Functional Requirements**
   - Voice input works for 95%+ of single-digit answers
   - Seamless fallback to keyboard input
   - Session completion without interruption

2. **Performance Requirements**
   - < 500ms latency from speech to result
   - Continuous recognition without gaps
   - Smooth transitions between problems

3. **User Experience**
   - Clear visual feedback
   - Intuitive voice indicators
   - Minimal setup required

## Notes on FastMath Integration

The voice test implementation extracts these key patterns from FastMath:

1. **Session Management**: Simplified version of `sessionManagementService.ts`
2. **Input Handling**: Core logic from `QuestionTextInput` component
3. **Timer System**: Adapted from `Timer.tsx` with voice considerations
4. **Progress Tracking**: Simplified version of progress system
5. **API Structure**: Following FastMath's route patterns

This focused implementation demonstrates voice capabilities while maintaining the core exercise flow that makes FastMath effective.