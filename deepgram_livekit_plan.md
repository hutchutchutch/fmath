# Deepgram/LiveKit Voice Input Integration Plan for FastMath

## Executive Summary

This document outlines a comprehensive plan to integrate the low-latency Deepgram/LiveKit voice transcription system into the FastMath application. The integration will replace the current Web Speech API implementation in the `QuestionVoiceInput` component with a more reliable, low-latency solution achieving sub-600ms transcription times.

## Current State Analysis

### Frontend Voice Input (Current)
- **Location**: `/fastmath/src/components/ui/input.tsx`
- **Component**: `QuestionVoiceInput` (alias for `QuestionTextInput`)
- **Technology**: Web Speech API (browser-native)
- **Issues**: 
  - Browser compatibility limitations
  - Inconsistent performance
  - No control over transcription models
  - Limited error handling

### Backend Infrastructure (Current)
- **Framework**: Express.js with TypeScript
- **Real-time**: No WebSocket/SSE implementation currently
- **Dependencies**: `@deepgram/sdk` already installed (but not used)
- **Authentication**: JWT-based with Bearer tokens

## Architecture Overview

```
┌─────────────────┐                    ┌─────────────────┐
│   FastMath UI   │                    │ FastMath Backend │
│  (React App)    │                    │   (Express.js)   │
├─────────────────┤                    ├─────────────────┤
│ QuestionVoice   │◄──── SSE ─────────│  Voice Routes   │
│     Input       │                    │                 │
│                 │──── HTTP ──────────►│ Token Generator │
│ LiveKit Client  │                    │                 │
│     SDK         │◄─── WebRTC ────┐   │ Audio Handler   │
└─────────────────┘                │   │                 │
                                   │   │ Deepgram Service│
                                   │   └─────────────────┘
                                   │            │
                              ┌────▼────┐       │
                              │ LiveKit │       │
                              │  Cloud  │◄──────┘
                              └─────────┘    WebSocket
                                            to Deepgram
```

## Implementation Phases

### Phase 1: Backend Infrastructure (Week 1)

#### 1.1 Create Voice Service Layer
**New Files:**
- `/fastmath-backend/src/services/voiceService.ts`
- `/fastmath-backend/src/services/deepgramService.ts`
- `/fastmath-backend/src/services/livekitService.ts`
- `/fastmath-backend/src/services/audioHandler.ts`

**voiceService.ts** - Main orchestrator
```typescript
export class VoiceService {
  private deepgramService: DeepgramService;
  private livekitService: LivekitService;
  private audioHandler: AudioHandler;
  private activeConnections: Map<string, VoiceConnection>;
  
  async createVoiceSession(userId: string, trackId: string): Promise<VoiceSession>;
  async joinRoom(roomName: string, userId: string): Promise<void>;
  async endVoiceSession(sessionId: string): Promise<void>;
}
```

**deepgramService.ts** - Deepgram integration
```typescript
export class DeepgramService extends EventEmitter {
  private connection: any;
  private keepAliveInterval: NodeJS.Timeout | null;
  
  async startTranscription(config: TranscriptionConfig): Promise<void>;
  sendAudio(audioData: Buffer): void;
  stop(): void;
}
```

**livekitService.ts** - LiveKit room management
```typescript
export class LivekitService {
  async createAccessToken(roomName: string, identity: string): Promise<string>;
  async createBackendToken(roomName: string): Promise<string>;
  validateRoom(roomName: string): boolean;
}
```

**audioHandler.ts** - Audio processing & VAD
```typescript
export class AudioHandler extends EventEmitter {
  private room: Room | null;
  private speechStartTime: number;
  private isSpeaking: boolean;
  
  async joinRoom(roomName: string, token: string): Promise<void>;
  private processAudioTrack(track: RemoteAudioTrack): Promise<void>;
  private detectVoiceActivity(buffer: Buffer): boolean;
}
```

#### 1.2 Create Voice API Routes
**New File:** `/fastmath-backend/src/routes/voice.ts`
```typescript
router.post('/voice/token', authenticate, createVoiceToken);
router.post('/voice/join-room', authenticate, joinVoiceRoom);
router.get('/voice/transcriptions/:sessionId', authenticate, streamTranscriptions);
router.post('/voice/end-session', authenticate, endVoiceSession);
```

#### 1.3 Add Real-time Communication
**New File:** `/fastmath-backend/src/middleware/sse.ts`
```typescript
export const setupSSE = (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  return {
    send: (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`),
    close: () => res.end()
  };
};
```

#### 1.4 Update Environment Configuration
**Update:** `/fastmath-backend/.env`
```env
# Existing vars...
LIVEKIT_URL=wss://your-instance.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
DEEPGRAM_API_KEY=your_deepgram_key
```

### Phase 2: Frontend Integration (Week 1-2)

#### 2.1 Create Voice Input Hook
**New File:** `/fastmath/src/hooks/useVoiceInput.ts`
```typescript
export const useVoiceInput = (config: VoiceInputConfig) => {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [latency, setLatency] = useState<number | null>(null);
  
  const startVoiceInput = async (): Promise<void>;
  const stopVoiceInput = async (): Promise<void>;
  const setupAudioMonitoring = (track: MediaStreamTrack): void;
  
  return {
    isListening,
    audioLevel,
    transcript,
    latency,
    startVoiceInput,
    stopVoiceInput
  };
};
```

#### 2.2 Create Voice Input Components
**New File:** `/fastmath/src/components/Voice/VoiceInputButton.tsx`
```typescript
export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscription,
  disabled,
  className
}) => {
  const { isListening, audioLevel, startVoiceInput, stopVoiceInput } = useVoiceInput();
  
  return (
    <button onClick={isListening ? stopVoiceInput : startVoiceInput}>
      {/* Microphone icon with audio level indicator */}
    </button>
  );
};
```

**New File:** `/fastmath/src/components/Voice/AudioLevelMeter.tsx`
```typescript
export const AudioLevelMeter: React.FC<{ level: number }> = ({ level }) => {
  return (
    <div className="audio-level-meter">
      <div 
        className="level-bar" 
        style={{ width: `${level}%` }}
      />
    </div>
  );
};
```

#### 2.3 Update QuestionVoiceInput Component
**Update:** `/fastmath/src/components/ui/input.tsx`
```typescript
// Add new imports
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { VoiceInputButton } from '../Voice/VoiceInputButton';
import { AudioLevelMeter } from '../Voice/AudioLevelMeter';

// Replace Web Speech API with LiveKit/Deepgram
const QuestionVoiceInput: React.FC<QuestionTextInputProps> = ({ 
  question, 
  onAnswer, 
  showFeedback, 
  enableVoice = true 
}) => {
  const {
    isListening,
    audioLevel,
    transcript,
    latency,
    startVoiceInput,
    stopVoiceInput
  } = useVoiceInput({
    onTranscription: (text: string, isFinal: boolean) => {
      const number = extractNumberFromSpeech(text);
      if (number !== null) {
        setValue(number.toString());
        if (isFinal) {
          processVoiceAnswer(number);
        }
      }
    }
  });
  
  // Rest of component logic...
};
```

### Phase 3: Data Models & Types (Week 2)

#### 3.1 Backend Types
**New File:** `/fastmath-backend/src/types/voice.ts`
```typescript
export interface VoiceSession {
  sessionId: string;
  userId: string;
  roomName: string;
  startTime: Date;
  endTime?: Date;
  transcriptions: Transcription[];
}

export interface Transcription {
  id: string;
  text: string;
  timestamp: Date;
  latency: number;
  isFinal: boolean;
  confidence?: number;
  audioStartTime: number;
}

export interface VoiceMetrics {
  sessionId: string;
  averageLatency: number;
  totalTranscriptions: number;
  successRate: number;
}
```

#### 3.2 Frontend Types
**Update:** `/fastmath/src/types/voice.ts`
```typescript
export interface VoiceInputConfig {
  onTranscription: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  onAudioLevel?: (level: number) => void;
  language?: string;
  model?: 'nova' | 'nova-2';
}

export interface VoiceTranscriptionEvent {
  text: string;
  latency: number;
  timestamp: number;
  isFinal: boolean;
  audioStartTime: number;
  participantId: string;
}
```

### Phase 4: Integration & Migration (Week 2-3)

#### 4.1 API Integration Updates
**Update:** `/fastmath/src/config/api.ts`
```typescript
// Add voice-related API calls
export const createVoiceSession = async (
  userId: string,
  trackId: string
): Promise<VoiceSessionResponse> => {
  const response = await api.post('/voice/session', { userId, trackId });
  return response.data;
};

export const getVoiceToken = async (
  roomName: string,
  participantName: string
): Promise<VoiceTokenResponse> => {
  const response = await api.post('/voice/token', { roomName, participantName });
  return response.data;
};
```

#### 4.2 Session Management Integration
**Update:** `/fastmath-backend/src/controllers/sessionManagementController.ts`
```typescript
// Add voice session tracking
export const getSessionController = async (req: Request, res: Response) => {
  // Existing logic...
  
  // Add voice session info if active
  const activeVoiceSession = await voiceService.getActiveSession(userId);
  if (activeVoiceSession) {
    response.voiceSession = {
      sessionId: activeVoiceSession.sessionId,
      roomName: activeVoiceSession.roomName,
      isActive: true
    };
  }
  
  res.json(response);
};
```

#### 4.3 Progress Tracking Updates
**Update:** `/fastmath-backend/src/services/progressService.ts`
```typescript
// Track voice input usage
interface ProgressUpdate {
  // Existing fields...
  inputMethod?: 'keyboard' | 'voice' | 'touchpad';
  voiceMetrics?: {
    latency: number;
    transcriptionAccuracy?: number;
  };
}
```

### Phase 5: Testing Strategy (Week 3)

#### 5.1 Unit Tests
**New Files:**
- `/fastmath-backend/tests/services/voiceService.test.ts`
- `/fastmath-backend/tests/services/deepgramService.test.ts`
- `/fastmath/src/hooks/useVoiceInput.test.tsx`

#### 5.2 Integration Tests
**New File:** `/fastmath-backend/tests/integration/voice-flow.test.ts`
```typescript
describe('Voice Input Flow', () => {
  it('should create voice session and receive transcriptions', async () => {
    // 1. Create voice session
    // 2. Connect to LiveKit
    // 3. Send audio data
    // 4. Verify transcriptions received via SSE
    // 5. End session and verify cleanup
  });
});
```

#### 5.3 Performance Tests
- Measure end-to-end latency
- Test concurrent voice sessions
- Verify cleanup on disconnection
- Monitor resource usage

### Phase 6: Deployment & Monitoring (Week 3-4)

#### 6.1 Environment Setup
1. Configure LiveKit Cloud instance
2. Set up Deepgram API credentials
3. Update CORS settings for SSE
4. Configure SSL for WebRTC

#### 6.2 Feature Flags
**New:** Add feature flag system
```typescript
export const FEATURES = {
  VOICE_INPUT_DEEPGRAM: process.env.REACT_APP_ENABLE_DEEPGRAM === 'true',
  VOICE_INPUT_FALLBACK: true // Keep Web Speech API as fallback
};
```

#### 6.3 Monitoring & Analytics
- Track voice input usage metrics
- Monitor latency percentiles
- Log transcription accuracy
- Track error rates by browser/device

## Migration Strategy

### Stage 1: Parallel Implementation
1. Keep existing Web Speech API functional
2. Add LiveKit/Deepgram as opt-in feature
3. A/B test with subset of users

### Stage 2: Gradual Rollout
1. Enable for 10% of users
2. Monitor performance metrics
3. Increase to 50%, then 100%
4. Keep fallback for unsupported browsers

### Stage 3: Deprecation
1. Mark Web Speech API as deprecated
2. Remove after 30 days of stable operation
3. Maintain fallback to keyboard input

## Security Considerations

1. **Token Management**
   - Generate short-lived LiveKit tokens (1 hour)
   - Validate user permissions per room
   - Implement rate limiting on token generation

2. **Room Isolation**
   - One room per user session
   - Automatic room cleanup after inactivity
   - Backend-only room joining

3. **Data Privacy**
   - No audio recording/storage
   - Transcriptions linked to user sessions
   - Implement data retention policies

## Performance Optimization

1. **Latency Reduction**
   - 10ms audio chunks
   - Direct streaming without buffering
   - Regional LiveKit/Deepgram endpoints

2. **Resource Management**
   - Cleanup inactive connections
   - Limit concurrent sessions per user
   - Implement connection pooling

3. **Caching Strategy**
   - Cache LiveKit room credentials
   - Reuse Deepgram connections
   - Browser-side transcript caching

## Error Handling

1. **Connection Failures**
   - Automatic reconnection with backoff
   - Fallback to Web Speech API
   - Clear user error messages

2. **Transcription Errors**
   - Retry logic for transient failures
   - Confidence threshold filtering
   - Manual correction options

3. **Browser Compatibility**
   - Detect WebRTC support
   - Graceful degradation
   - Clear incompatibility messaging

## Success Metrics

1. **Technical Metrics**
   - Average latency < 600ms
   - Transcription accuracy > 95%
   - Connection success rate > 99%
   - Error rate < 1%

2. **User Metrics**
   - Voice input adoption rate
   - Session completion rate
   - User satisfaction scores
   - Support ticket reduction

3. **Business Metrics**
   - Practice session duration increase
   - Student engagement improvement
   - Platform differentiation

## Timeline Summary

- **Week 1**: Backend infrastructure & API routes
- **Week 2**: Frontend components & integration
- **Week 3**: Testing & optimization
- **Week 4**: Deployment & monitoring

Total estimated effort: 4 weeks with 2 developers

## Conclusion

This implementation plan provides a structured approach to integrating Deepgram/LiveKit voice input into FastMath. The phased approach ensures minimal disruption while delivering significant improvements in reliability, latency, and user experience. The system is designed to be scalable, maintainable, and provides clear fallback options for maximum compatibility.