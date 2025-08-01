# Phase 3: Audio Pipeline - Completed

## Overview

Phase 3 establishes the core audio routing system that receives audio from LiveKit rooms and distributes it to multiple speech-to-text services (Deepgram and Groq) for parallel processing.

## Architecture

```
LiveKit Room (Browser)
    ↓ WebRTC
LiveKit Server
    ↓ Server SDK
Room Manager (subscribes to audio tracks)
    ↓ Audio events
Audio Router (distributes audio)
    ├─→ Deepgram (WebSocket streaming)
    └─→ Groq (Chunked processing)
    
Results aggregated and sent via SSE
```

## Components Created

### 1. LiveKit Room Manager (`backend/src/services/livekitRoomManager.ts`)

**Purpose**: Server-side LiveKit client that joins rooms and subscribes to audio tracks

**Key Features**:
- Automatic audio track subscription
- Event-based audio data emission
- Room and participant lifecycle management
- Connection quality monitoring
- Data channel support for metadata

**Key Methods**:
- `joinRoom(roomName, identity)` - Join a room as server participant
- `leaveRoom(roomName)` - Disconnect and cleanup
- `sendData(roomName, data)` - Send data messages to room
- `getActiveRooms()` - List all connected rooms

**Events Emitted**:
- `audioData` - Raw audio frames with metadata
- `participantJoined/Left` - Participant lifecycle
- `roomDisconnected` - Room disconnection
- `dataReceived` - Data channel messages

### 2. Audio Router (`backend/src/services/audioRouter.ts`)

**Purpose**: Routes incoming audio to multiple STT services with different processing strategies

**Key Features**:
- **Deepgram**: Real-time streaming via WebSocket
- **Groq**: Chunked processing (3-second segments)
- Automatic reconnection for Deepgram
- Buffer management with cleanup
- Number extraction from transcriptions
- Unified result format

**Processing Strategies**:
1. **Deepgram (Streaming)**:
   - Immediate forwarding of audio chunks
   - Low latency, continuous processing
   - WebSocket-based communication

2. **Groq (Chunked)**:
   - Buffers audio for 3-second chunks
   - Batch processing for efficiency
   - File-based API submission

**Events Emitted**:
- `transcription` - Unified transcription results
- `deepgramConnected/Disconnected` - Connection status
- `deepgramError` - Connection errors

### 3. API Endpoints (`backend/src/routes/livekit.ts`)

#### Room Management
```
POST /api/livekit/join-room
- Join a room to start receiving audio
- Body: { roomName: string }
- Returns: { success, roomName, services }

POST /api/livekit/leave-room
- Leave a room and stop audio processing
- Body: { roomName: string }
- Returns: { success, roomName }
```

#### Status and Monitoring
```
GET /api/livekit/status
- Get current routing status
- Returns: { rooms: { activeRooms }, services: { deepgram, groq, activeParticipants } }

GET /api/livekit/transcriptions
- Server-Sent Events endpoint for real-time transcriptions
- Returns: Stream of transcription events
```

## Data Flow

### 1. Audio Capture Flow
```javascript
Browser Mic → LiveKit Track → Server Subscription → Audio Frames
```

### 2. Transcription Result Format
```javascript
{
  service: 'deepgram' | 'groq',
  text: 'transcribed text',
  number: 5,  // Extracted number or null
  latency: 150,  // ms
  timestamp: 1234567890,
  participantId: 'user-123',
  roomName: 'fastmath-room'
}
```

## Testing the Pipeline

### 1. Run the Test Script
```bash
./test-audio-pipeline.sh
```

This script will:
- Verify all services are configured
- Join a test room
- Monitor for transcriptions
- Display results in real-time

### 2. Manual Testing

#### Join a room:
```bash
curl -X POST http://localhost:3001/api/livekit/join-room \
  -H "Content-Type: application/json" \
  -d '{"roomName": "test-room"}'
```

#### Check status:
```bash
curl http://localhost:3001/api/livekit/status | jq
```

#### Monitor transcriptions:
```bash
curl -N http://localhost:3001/api/livekit/transcriptions
```

## Key Design Decisions

### 1. Service-Specific Processing
- **Deepgram**: Optimized for streaming with minimal buffering
- **Groq**: Chunked processing to balance API calls and accuracy
- **Web Speech**: Remains client-side (Phase 4)

### 2. Buffer Management
- Automatic cleanup of old buffers (>1 minute)
- Per-participant buffer tracking
- Memory-efficient processing

### 3. Error Handling
- Graceful service degradation
- Automatic Deepgram reconnection
- Comprehensive error logging

### 4. Real-time Communication
- Server-Sent Events for transcription results
- Low-latency audio forwarding
- Parallel processing without blocking

## Performance Considerations

### Latency Targets
- Deepgram: <500ms (streaming)
- Groq: ~3-4s (chunk duration + processing)
- End-to-end: <1s for first result

### Scalability
- Per-participant audio processing
- Independent service scaling
- Efficient buffer management

### Resource Usage
- Minimal memory footprint
- Efficient buffer recycling
- Automatic cleanup routines

## Troubleshooting

### "Failed to join room"
- Check LiveKit credentials
- Verify room exists
- Check network connectivity

### No Deepgram transcriptions
- Verify DEEPGRAM_API_KEY in .env
- Check WebSocket connection logs
- Monitor for reconnection attempts

### No Groq transcriptions
- Verify GROQ_API_KEY in .env
- Check audio buffer sizes
- Monitor 3-second processing intervals

### High memory usage
- Check buffer cleanup logs
- Verify participant cleanup on disconnect
- Monitor active participant count

## Next Steps (Phase 4)

With the audio pipeline complete, Phase 4 will:
1. Update frontend to use LiveKit instead of direct mic
2. Add third display for Groq results
3. Implement three-way transcription comparison
4. Update timing and latency measurements

## Security Notes

1. **Room Access**: Server uses dedicated identity
2. **Audio Privacy**: Audio processed in memory only
3. **API Keys**: Never exposed to frontend
4. **Webhook Security**: Signature verification enabled

---

Phase 3 successfully establishes a robust audio routing pipeline that can process audio from LiveKit rooms through multiple speech-to-text services simultaneously. The system is designed for real-time performance, reliability, and scalability.