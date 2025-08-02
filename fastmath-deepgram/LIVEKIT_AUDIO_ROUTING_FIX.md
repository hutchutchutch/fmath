# LiveKit Audio Routing Fix

## Problem
The LiveKit Server SDK doesn't support subscribing to media tracks like the Client SDK does. This meant the backend couldn't receive audio from LiveKit participants, preventing Deepgram and Groq from processing the audio.

## Root Cause
- LiveKit Server SDK is designed for administrative operations, not media consumption
- The `Room` class in Server SDK doesn't have media subscription capabilities
- The simulated audio in `livekitRoomManagerFixed.ts` was just a testing placeholder

## Solution
Implemented direct audio streaming from browser to backend using WebSockets:

### 1. Created Audio Stream WebSocket (`/backend/src/routes/audioStream.ts`)
- WebSocket endpoint at `/ws/audio-stream`
- Receives raw audio buffers from browser
- Emits audio to the audio router for processing

### 2. Created Direct Input Component (`TripleVoiceInputDirect.tsx`)
- Captures microphone audio using Web Audio API
- Converts audio to 16kHz PCM16 format
- Streams audio via WebSocket to backend
- Receives transcriptions via Server-Sent Events (SSE)

### 3. Updated Audio Router
- Added direct audio data listener
- Processes audio from WebSocket instead of LiveKit
- Routes to Deepgram (streaming) and Groq (3-second chunks)

## How It Works Now

```
Browser Microphone
    ↓
Web Audio API (ScriptProcessor)
    ↓
WebSocket → Backend Audio Stream
    ↓
Audio Router
    ├→ Deepgram WebSocket (real-time)
    └→ Groq API (3-second chunks)
    ↓
SSE → Browser (transcriptions)
```

## Benefits
1. **Simpler Architecture**: No LiveKit media server required
2. **Lower Latency**: Direct audio streaming
3. **More Control**: Can process audio exactly as needed
4. **Works Today**: No need for LiveKit Egress or other complex setups

## Testing
1. Refresh the browser at http://localhost:3000
2. Allow microphone access
3. Click "Start" to begin audio streaming
4. Speak numbers clearly
5. Watch for transcriptions from all three services:
   - Web Speech API (browser-based)
   - Deepgram (via WebSocket)
   - Groq/Whisper (via backend processing)

## Key Files Modified
- `/backend/src/routes/audioStream.ts` - WebSocket audio receiver
- `/backend/src/server.ts` - Added WebSocket setup
- `/backend/src/services/audioRouter.ts` - Added direct audio listener
- `/frontend/src/components/TripleVoiceInputDirect.tsx` - Direct audio streaming component
- `/frontend/src/components/VoiceExerciseWithDirect.tsx` - Exercise wrapper
- `/frontend/src/App.tsx` - Use direct component

## Future Improvements
1. Add audio compression for bandwidth optimization
2. Implement adaptive bitrate based on network conditions
3. Add reconnection logic for WebSocket failures
4. Support multiple audio formats/codecs

This approach bypasses the LiveKit Server SDK limitations and provides a working solution for comparing speech recognition services in real-time.