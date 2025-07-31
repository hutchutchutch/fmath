# Voice Input Implementation Plan

## Overview
This plan outlines the implementation of voice input functionality for FastMath, allowing users to speak their answers instead of typing. We'll implement both Deepgram and Web Speech API versions to compare latency and accuracy. The voice input system must remain active throughout entire exercise sessions, which include multiple problems with both session-level and individual problem timers.

## Exercise System Context

### Exercise Generation & Flow

1. **Session Management API**
   - Route: `GET /session/:userId/:trackId`
   - Returns available activities based on user progress
   - Activities include: learn, accuracyPractice, fluencyPractice
   - Each activity contains an array of facts to practice

2. **Exercise Types & Progression**
   - **Learning Phase** (`PracticePage.tsx`): No timer, practice until mastery
   - **Timed Practice** (`TimedPracticePage.tsx`): Individual timers per problem (3-6s)
   - **Accuracy/Fluency Practice**: Progressive difficulty with timing requirements

3. **Key Components**
   - `QuestionTextInput` (in `input.tsx`): Main input component for answers
   - `Timer.tsx`: Individual problem timer with green/yellow zones
   - `SessionContext.tsx`: Tracks page transitions and session data
   - `sessionManagementService.ts`: Generates practice sessions

4. **Problem Flow**
   - Session starts → Fetch facts from API
   - Present problem → Start timer
   - User answers → Validate → Update progress
   - Auto-advance to next problem or show feedback
   - Continue until session complete

## Architecture Overview

### 1. Voice Input Service Layer
Create a unified interface for voice input that can switch between implementations:

```typescript
// src/services/voiceInputService.ts
interface VoiceInputProvider {
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  pauseListening(): void; // Pause during feedback/transitions
  resumeListening(): void; // Resume for next problem
  onResult: (transcript: string) => void;
  onError: (error: Error) => void;
  getMetrics(): VoiceMetrics;
  isActive: boolean;
}

interface VoiceMetrics {
  provider: 'deepgram' | 'webspeech';
  latency: number; // ms from speech end to result
  confidence?: number;
  startTime: number;
  endTime: number;
  finalTranscript: string;
  problemId: string; // Track metrics per problem
  sessionId: string; // Track metrics per session
}
```

### 2. Deepgram Implementation

#### Backend WebSocket Service
```typescript
// src/services/deepgramService.ts
- WebSocket connection to Deepgram Live Transcription API
- Real-time audio streaming from client
- Latency tracking from audio chunk to transcript
```

#### API Endpoints
```typescript
// src/routes/voice.ts
POST /voice/deepgram/token - Get temporary auth token
WS   /voice/deepgram/stream - WebSocket for audio streaming
```

### 3. Web Speech API Implementation

#### Client-Side Service
```typescript
// src/services/webSpeechService.ts
- Direct browser implementation
- No backend required
- Native browser latency
```

### 4. Voice-Enabled Input Component

#### Enhanced QuestionTextInput
```typescript
// src/components/ui/VoiceEnabledInput.tsx
- Microphone button UI
- Visual feedback during listening
- Provider selection (Deepgram/Web Speech)
- Latency display in debug mode
```

## Implementation Steps

### Phase 1: Backend Infrastructure (Week 1)

1. **Deepgram Service Setup**
   - Create WebSocket handler for audio streaming
   - Implement token generation endpoint
   - Add audio processing pipeline
   - Set up latency measurement points

2. **Database Schema Updates**
   ```sql
   CREATE TABLE voice_input_metrics (
     id UUID PRIMARY KEY,
     user_id VARCHAR(255),
     session_id VARCHAR(255),
     provider VARCHAR(50),
     question_id VARCHAR(255),
     transcript TEXT,
     expected_answer INTEGER,
     is_correct BOOLEAN,
     latency_ms INTEGER,
     confidence FLOAT,
     audio_duration_ms INTEGER,
     created_at TIMESTAMP
   );
   ```

### Phase 2: Frontend Implementation (Week 2)

1. **Voice Input Hook**
   ```typescript
   // src/hooks/useVoiceInput.ts
   - Provider initialization at session start
   - Continuous audio stream management
   - State management (listening, paused, processing)
   - Auto-reconnect on connection loss
   - Session-wide metrics aggregation
   ```

2. **UI Components**
   - Microphone status indicator (always visible)
   - Voice activity visualization
   - Provider toggle (A/B testing)
   - Latency metrics display (dev mode)
   - Connection status indicator

3. **Integration Points**
   - **QuestionTextInput** (`input.tsx:33-190`): 
     - Parallel voice/typing input
     - Voice transcript auto-fill
     - Dual-mode answer submission
   
   - **Practice Pages** (`PracticePage.tsx`, `TimedPracticePage.tsx`):
     - Initialize voice on mount
     - Pause during feedback
     - Resume for next problem
     - Cleanup on unmount
   
   - **SessionContext** (`SessionContext.tsx`):
     - Track voice metrics alongside page transitions
     - Aggregate session-level voice statistics
     - Record voice vs typing usage per problem

### Phase 3: Metrics & Analytics (Week 3)

1. **Latency Measurement Points**
   - T0: User starts speaking
   - T1: Speech detected
   - T2: User stops speaking
   - T3: Transcript received
   - T4: Answer processed

2. **Accuracy Metrics**
   - Word Error Rate (WER)
   - Digit recognition accuracy
   - Confidence scores
   - Retry rates

3. **Performance Dashboard**
   ```typescript
   // src/pages/admin/VoiceMetrics.tsx
   - Real-time latency graphs
   - Provider comparison
   - User success rates
   - Error analysis
   ```

## Technical Specifications

### Deepgram Configuration
```typescript
const deepgramConfig = {
  model: 'nova-2-numerics', // Optimized for numbers
  language: 'en-US',
  punctuate: false,
  numerals: true,
  endpointing: 300, // ms of silence to detect end
  vad_events: true, // Voice activity detection
  interim_results: true,
  keep_alive: true // Maintain connection between problems
};
```

### Web Speech API Configuration
```typescript
const webSpeechConfig = {
  continuous: true, // Keep listening across problems
  interimResults: true,
  maxAlternatives: 1,
  lang: 'en-US'
};
```

### Session Management
```typescript
interface VoiceSession {
  sessionId: string;
  startTime: Date;
  provider: 'deepgram' | 'webspeech';
  problemMetrics: Map<string, VoiceMetrics>;
  aggregateMetrics: {
    totalProblems: number;
    voiceAnswers: number;
    typedAnswers: number;
    averageLatency: number;
    errorCount: number;
  };
}
```

### Audio Processing
- Sample rate: 16kHz
- Encoding: Linear16 PCM
- Chunk size: 1024 bytes
- Buffer duration: 100ms

## Testing Strategy

### 1. Unit Tests
```typescript
// tests/services/voiceInput.test.ts
- Provider initialization
- Audio stream handling
- Transcript parsing
- Error scenarios
```

### 2. Integration Tests
```typescript
// tests/integration/voiceFlow.test.ts
- End-to-end voice input flow
- Provider switching
- Latency measurement accuracy
- Database recording
```

### 3. Performance Tests
- Load testing with concurrent users
- Network latency simulation
- Audio quality degradation handling
- Mobile device testing

### 4. A/B Testing Framework
```typescript
interface VoiceABTest {
  userId: string;
  variant: 'deepgram' | 'webspeech' | 'control';
  metrics: {
    sessionsCompleted: number;
    averageLatency: number;
    errorRate: number;
    userSatisfaction?: number;
  };
}
```

## Success Metrics

### Primary Metrics
1. **Latency**: < 500ms from speech end to result display
2. **Accuracy**: > 95% for single/double digit numbers
3. **User Adoption**: > 30% of users try voice input
4. **Error Rate**: < 5% failed recognitions

### Secondary Metrics
1. **Session Completion**: Higher with voice vs typing
2. **Time per Problem**: Reduced by 20%
3. **Accessibility**: Improved for motor-impaired users
4. **Device Coverage**: Works on 90% of devices

## Rollout Plan

### Week 1-2: Development
- Backend infrastructure
- Basic frontend implementation
- Internal testing

### Week 3: Beta Testing
- 5% of users (feature flag)
- Collect metrics
- Fix critical issues

### Week 4: Gradual Rollout
- 25% → 50% → 100%
- Monitor performance
- A/B test results

### Week 5: Optimization
- Performance tuning
- UI refinements
- Documentation

## Security Considerations

1. **Audio Data**
   - No permanent storage of audio
   - Encrypted transmission
   - User consent required

2. **API Security**
   - Rate limiting per user
   - Token expiration (5 minutes)
   - CORS restrictions

3. **Privacy**
   - Opt-in feature
   - Clear data usage policy
   - COPPA compliance for minors

## Cost Analysis

### Deepgram Pricing
- $0.0125 per minute
- Estimated: 2 seconds per problem
- Cost per user session (50 problems): $0.02

### Infrastructure
- WebSocket server scaling
- Additional bandwidth: ~100KB per session
- Database storage: Minimal

## Implementation Challenges & Solutions

### 1. **Continuous Connection Management**
   - **Challenge**: Maintaining WebSocket/audio connection across multiple problems
   - **Solution**: Implement connection pooling with auto-reconnect logic
   - **Fallback**: Queue transcripts during reconnection

### 2. **State Synchronization**
   - **Challenge**: Coordinating voice input with problem transitions
   - **Solution**: Pause/resume pattern tied to problem lifecycle
   - **Edge Case**: Handle voice input arriving during transitions

### 3. **Latency During Timed Exercises**
   - **Challenge**: Voice latency affecting timer-based exercises
   - **Solution**: Start processing at speech onset, not completion
   - **Optimization**: Pre-buffer common number patterns

### 4. **Audio Feedback Interference**
   - **Challenge**: Correct/incorrect sounds triggering voice input
   - **Solution**: Mute microphone during audio feedback
   - **Alternative**: Use echo cancellation

## Future Enhancements

1. **Multi-language Support**
   - Spanish numbers
   - Accessibility improvements

2. **Advanced Features**
   - Voice commands ("next", "repeat", "skip")
   - Hands-free mode
   - Voice feedback for answers

3. **ML Improvements**
   - Custom model training on FastMath data
   - User-specific adaptation
   - Context-aware number recognition

4. **Performance Optimizations**
   - Edge processing for reduced latency
   - Predictive loading for common answers
   - Hybrid mode (voice + partial typing)

## Conclusion

This implementation provides a robust voice input system that operates continuously throughout exercise sessions. By implementing both Deepgram and Web Speech API with careful session management and state synchronization, we can compare performance while ensuring a seamless user experience. The system is designed to handle the unique requirements of FastMath's timed exercises while gathering comprehensive metrics for optimization.