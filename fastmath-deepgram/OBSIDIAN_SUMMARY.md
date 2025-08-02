# FastMath LiveKit Integration - Development Summary

## Project Overview
Built a triple speech recognition system comparing Web Speech API, Deepgram, and Groq/Whisper side-by-side for a math exercise application.

## Initial Goal
Create a voice-controlled math exercise app that uses LiveKit as a central audio routing hub to distribute microphone input to multiple speech recognition services simultaneously.

## Major Challenges & Solutions

### 1. LiveKit Server SDK Limitations
**Problem**: Discovered that LiveKit Server SDK cannot subscribe to media tracks - it's designed for administrative operations only.
**Solution**: Pivoted to direct audio streaming from browser to backend via WebSocket, bypassing LiveKit's limitations.

### 2. Audio Format Requirements
**Problem**: Different services require different audio formats:
- Deepgram: PCM16 via WebSocket streaming
- Groq/Whisper: WebM/Opus format in chunks
- Web Speech API: Direct browser access

**Solution**: Implemented dual audio capture:
- ScriptProcessorNode for PCM16 (Deepgram)
- MediaRecorder for WebM (Groq)
- Native Web Speech API for browser

### 3. Room Name Mismatch
**Problem**: Frontend created unique room names but Deepgram transcriptions were hardcoded to "default", causing them to be ignored.
**Solution**: Added room/participant tracking to AudioRouter to maintain consistency across all services.

### 4. High Latency Issues
**Problem**: Deepgram showing 4-8 second latency, Web Speech API showing 0.5-9 seconds.
**Solutions**:
- Added speech detection based on audio amplitude
- Fixed latency calculation (was using audio duration instead of processing time)
- Implemented silence detection to reset timers between utterances
- Filter Deepgram results to only process final transcriptions

### 5. Transcription Quality
**Problem**: Non-numeric content being transcribed (e.g., "Jesus Christ" instead of "7").
**Solutions**:
- Added number-only prompts for Groq/Whisper
- Implemented transcription sanitization to filter non-numeric content
- Added keyword boosting for Deepgram
- Enhanced number extraction supporting words and digits

## Technical Implementation

### Frontend Components
- `TripleVoiceInputDirect.tsx`: Main component handling all three services
- `VoiceExerciseWithDirect.tsx`: Exercise wrapper component
- `TranscriptionResultsTriple.tsx`: Results display component

### Backend Services
- `audioRouter.ts`: Central hub for routing audio to services
- `audioStream.ts`: WebSocket endpoint for receiving browser audio
- `groqService.ts`: Groq/Whisper integration
- Direct Deepgram WebSocket connection

### Key Features
1. **Parallel Processing**: All three services process audio simultaneously
2. **Real-time Streaming**: Deepgram receives continuous audio stream
3. **Chunk Processing**: Groq processes 3-second audio chunks
4. **Auto-submission**: Submits answer after receiving input from services
5. **Latency Tracking**: Measures time from speech start to transcription

## Scripts Created
- `start-all.sh`: Comprehensive startup with port management
- `dev.sh`: Quick development startup
- `test-backend.sh`: Backend endpoint testing
- `check-env.sh`: Environment verification
- Various debugging scripts

## Current Status
✅ All three services working
✅ Room name synchronization fixed
✅ Latency improvements implemented
✅ Number-only filtering active
✅ Comprehensive logging for debugging

## Lessons Learned
1. LiveKit Server SDK is not suitable for media subscription
2. Different speech services have very different requirements
3. Proper speech detection is crucial for accurate latency measurement
4. Silence detection helps separate utterances
5. Audio format conversion is critical for service compatibility

## Performance Metrics
- Web Speech API: Variable (0.5-9s) → More consistent
- Deepgram: 4-8s → Should be <1s with fixes
- Groq/Whisper: Works when audio is clear, ~400ms latency

## Future Improvements
1. Implement proper VAD (Voice Activity Detection)
2. Add WebRTC peer connection for lower latency
3. Implement audio preprocessing for better accuracy
4. Add confidence scores to UI
5. Support for more languages/accents