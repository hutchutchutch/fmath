# Working LiveKit/Deepgram Voice Input Setup

This document captures the functional LiveKit/Deepgram voice input configuration for FastMath as of January 2025.

## Overview

The voice input system uses:
- **LiveKit** for WebRTC audio streaming
- **Deepgram** for real-time speech-to-text transcription
- **Server-Sent Events (SSE)** for streaming transcriptions back to the frontend

## Architecture

```
Frontend (React)          Backend (Express)         External Services
     |                         |                           |
     |---(1) Request Token---->|                           |
     |<--(2) LiveKit Token-----|                           |
     |                         |                           |
     |---(3) Connect---------->|------LiveKit Cloud------->|
     |    to Room              |                           |
     |                         |                           |
     |---(4) Publish---------->|                           |
     |    Audio Track          |                           |
     |                         |                           |
     |---(5) Request---------->|                           |
     |    Backend Join         |                           |
     |                         |---(6) Join Room---------->|
     |                         |<--(7) Subscribe to--------|
     |                         |    Audio Track            |
     |                         |                           |
     |<--(8) SSE Connection----|                           |
     |    for Transcriptions   |                           |
     |                         |---(9) Send Audio--------->|
     |                         |    to Deepgram            |
     |                         |<--(10) Transcriptions-----|
     |<--(11) Stream-----------|                           |
     |    Transcriptions       |                           |
```

## Key Components

### Frontend

#### VoiceInputLiveKit Component
**Location**: `/fastmath/src/components/TestVoiceAssessment/VoiceInputLiveKit.tsx`

Key features:
- Requests microphone permission on mount
- Connects to LiveKit room using WebRTC
- Publishes local audio track
- Monitors audio levels using Web Audio API
- Receives transcriptions via SSE
- Extracts numbers from transcribed text

#### API Endpoints Used
- `POST http://localhost:3000/voice/token` - Get LiveKit access token
- `POST http://localhost:3000/voice/join-room` - Request backend to join room
- `GET http://localhost:3000/voice/transcriptions` - SSE endpoint for transcriptions

### Backend

#### Voice Routes
**Location**: `/fastmath-backend/src/routes/voice.ts`

Endpoints:
- `POST /voice/token` - Generates LiveKit JWT token for client
- `POST /voice/join-room` - Backend joins LiveKit room as bot
- `GET /voice/transcriptions` - SSE endpoint streaming transcriptions

#### Audio Handler
**Location**: `/fastmath-backend/src/services/voice/audioHandler.ts`

Responsibilities:
- Joins LiveKit room as backend participant
- Subscribes to remote audio tracks
- Processes audio in 10ms chunks (ultra-low latency)
- Implements voice activity detection (VAD)
- Sends audio to Deepgram service
- Emits transcription events

#### Deepgram Service
**Location**: `/fastmath-backend/src/services/voice/deepgramService.ts`

Configuration:
- Model: `nova`
- Language: `en-US`
- Encoding: `linear16`
- Sample rate: 48000Hz
- Channels: 1
- Interim results: enabled

### Environment Variables

#### Backend (.env)
```env
# LiveKit Configuration
LIVEKIT_URL=wss://voice-i5e0rl2c.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Deepgram Configuration
DEEPGRAM_API_KEY=your_deepgram_key

# Server Configuration
PORT=3000
```

#### Frontend
No specific environment variables needed - uses localStorage for auth token.

## Server Configuration

### Backend (Express)
- **Port**: 3000
- **CORS**: Configured to allow requests from:
  - `http://localhost:3000` (frontend dev server)
  - `http://localhost:3001` (alternate frontend port)
  - `https://app.fastmath.pro` (production)

### Frontend (React)
- **Port**: 3001 (when using start-fastmath.sh)
- **Proxy**: Not currently used (direct API calls to backend)

## Working Flow

1. **User clicks "Start Voice"**
   - Frontend requests microphone permission
   - Generates unique room name: `test-room-{timestamp}`

2. **Token Generation**
   - Frontend requests LiveKit token from backend
   - Backend creates JWT with room access permissions

3. **LiveKit Connection**
   - Frontend connects to LiveKit cloud using token
   - Creates and publishes local audio track
   - Sets up audio level monitoring

4. **Backend Joins Room**
   - Frontend requests backend to join the same room
   - Backend joins as "fastmath-backend" participant
   - Subscribes to user's audio track

5. **Audio Processing**
   - Backend receives audio frames from LiveKit
   - Processes in 10ms chunks for low latency
   - Implements VAD to detect speech
   - Sends audio to Deepgram via WebSocket

6. **Transcription Flow**
   - Deepgram returns interim and final transcriptions
   - Backend emits transcription events
   - Frontend receives via SSE connection
   - Extracts numbers from transcribed text

## Latency Metrics

From the logs, typical latencies observed:
- **Interim results**: 3-99ms (very fast feedback)
- **Final results**: 100-600ms (accurate transcription)
- **End-to-end**: Sub-second response time

## Debugging Output

The system includes comprehensive debugging at each stage:

### Frontend Logs
- 🎤 Microphone permission requests
- 🏠 Room name generation
- 🎫 Token requests
- 🔗 LiveKit connection status
- 📤 Track publishing
- 🎵 Audio track details
- 📻 SSE connection status
- 📨 Transcription receipts
- 🎯 Number extraction

### Backend Logs
- 🎫 Token generation
- 🤖 Room joining
- 📡 Track subscription
- 🌊 Deepgram service status
- 🎧 Audio frame processing
- 🎤 Voice activity detection
- 📝 Transcription events
- 📤 SSE message sending

## Common Issues and Solutions

### Issue: "Cannot POST /voice/token"
**Solution**: Ensure backend is running on correct port (3000) and voice routes are registered.

### Issue: No transcriptions received
**Solution**: Check:
1. Deepgram API key is valid
2. LiveKit credentials are correct
3. Backend successfully joined room
4. Audio track is publishing

### Issue: High latency
**Solution**: Ensure:
1. Using 10ms audio chunks
2. VAD threshold is properly tuned
3. Keep-alive is active on Deepgram connection

## Testing Voice Input

To test the system:
1. Navigate to `http://localhost:3001/test-voice-assessment`
2. Click "Start Voice" button
3. Grant microphone permission
4. Speak numbers clearly (e.g., "thirteen", "six", "eighteen")
5. Watch console for detailed debugging output

## Key Success Indicators

When working correctly, you should see:
1. ✅ Microphone permission granted
2. ✅ LiveKit token received
3. ✅ Connected to LiveKit room
4. ✅ Audio track published
5. ✅ Backend joined room
6. ✅ SSE connection opened
7. 🎯 Transcriptions received with low latency

## Notes

- The system uses word-to-number conversion for spoken numbers
- Supports numbers 0-20 and tens (30, 40, etc.)
- Automatically extracts numeric values from speech
- Provides both interim (fast) and final (accurate) results
- Audio levels are monitored for visual feedback
- Voice Activity Detection prevents sending silence