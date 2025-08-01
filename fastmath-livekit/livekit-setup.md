# LiveKit Integration Setup Guide

This guide documents the complete setup process for integrating LiveKit into the FastMath application for real-time audio processing with multiple speech-to-text services.

## Overview

LiveKit serves as the central audio routing hub, distributing a single microphone input to multiple speech recognition services:
- Web Speech API (browser-based)
- Deepgram (WebSocket)
- Groq/Whisper (API-based)

## Prerequisites

1. **LiveKit Cloud Account**
   - Sign up at https://cloud.livekit.io/
   - Create a new project
   - Note your API Key, API Secret, and WebSocket URL

2. **API Keys Required**
   - LiveKit API Key & Secret
   - Deepgram API Key
   - Groq API Key (for Whisper model)

## Environment Configuration

### 1. Create `.env` file in the project root

```bash
# LiveKit Configuration
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=your-secret-key-here

# Speech Recognition Services
DEEPGRAM_API_KEY=your-deepgram-key
GROQ_API_KEY=your-groq-key

# Other existing configuration...
```

### 2. Important Notes
- No quotes around environment variable values
- LiveKit URL must start with `wss://`
- All keys are required for full functionality

## Installation

### Backend Dependencies

```bash
cd backend
npm install livekit-server-sdk groq-sdk
```

### Frontend Dependencies

```bash
cd ../frontend
npm install livekit-client
```

## Backend Implementation

### 1. LiveKit Configuration Module (`backend/src/config/livekit.ts`)

```typescript
import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

export const livekitConfig = {
  apiKey: process.env.LIVEKIT_API_KEY || '',
  apiSecret: process.env.LIVEKIT_API_SECRET || '',
  url: process.env.LIVEKIT_URL || '',
};

export async function createToken(roomName: string, participantName: string): Promise<string> {
  if (!livekitConfig.apiKey || !livekitConfig.apiSecret) {
    throw new Error('LiveKit API key and secret are required');
  }

  const token = new AccessToken(
    livekitConfig.apiKey,
    livekitConfig.apiSecret,
    {
      identity: participantName,
      ttl: 3600, // 1 hour in seconds
    }
  );

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await token.toJwt();
}
```

### 2. Token Generation Endpoint

Add to `backend/src/server.ts`:

```typescript
app.post('/api/livekit/token', async (req, res) => {
  try {
    const { roomName = 'fastmath-room', participantName = 'user' } = req.body;
    
    const token = await createToken(roomName, participantName);
    res.json({ token, url: process.env.LIVEKIT_URL });
  } catch (error) {
    console.error('Error creating LiveKit token:', error);
    res.status(500).json({ error: 'Failed to create token' });
  }
});
```

## Frontend Implementation

### 1. LiveKit Connection Component

Key implementation details:

```typescript
import { Room, RoomEvent, createLocalTracks } from 'livekit-client';

// Create room instance
const room = new Room({
  adaptiveStream: true,
  dynacast: true,
});

// Connect to room
await room.connect(url, token);

// Create and publish audio track
const tracks = await createLocalTracks({
  audio: true,
  video: false,
});

await Promise.all(tracks.map(track => 
  room.localParticipant.publishTrack(track)
));
```

### 2. Audio Processing Flow

```
User Microphone
    ↓
LiveKit Room (WebRTC)
    ↓
LiveKit Server
    ↓
Audio Distribution:
    ├─→ Deepgram (WebSocket)
    ├─→ Groq/Whisper (API)
    └─→ Web Speech API (local)
```

## Testing the Integration

### 1. Run the Test Script

```bash
./livekit-test.sh
```

This script:
- Validates environment variables
- Starts backend and frontend servers
- Creates a test interface at http://localhost:3000

### 2. Test Steps

1. Open http://localhost:3000
2. Click "Connect to LiveKit"
3. Allow microphone permissions
4. Verify successful connection

### 3. Success Indicators

- ✅ Backend configured with LiveKit URL
- ✅ Token received (JWT format)
- ✅ Connected to LiveKit room
- ✅ Publishing audio track

## Common Issues and Solutions

### "Token is not a string" Error

**Issue**: `token.substring is not a function`

**Solution**: Ensure `toJwt()` is awaited:
```typescript
const jwt = await token.toJwt(); // ✅ Correct
const jwt = token.toJwt();       // ❌ Returns Promise
```

### 500 Error on Token Request

**Possible Causes**:
1. Missing environment variables
2. Invalid API key/secret format
3. Async function not properly awaited

**Debug Steps**:
1. Check `/api/livekit/test` endpoint
2. Verify env vars are loaded
3. Check backend console logs

### Connection Failed After Token

**Possible Causes**:
1. Invalid LiveKit URL format
2. API key/secret mismatch
3. Network/firewall blocking WebSocket

**Solutions**:
1. Verify URL starts with `wss://`
2. Ensure key/secret match your LiveKit project
3. Test WebSocket connectivity

## Architecture Benefits

1. **Unified Audio Source**: Single microphone capture distributed to all services
2. **Synchronization**: All services receive identical audio frames
3. **Scalability**: Easy to add more STT services
4. **Reliability**: LiveKit handles reconnections and network issues
5. **Quality**: Adaptive bitrate and echo cancellation

## Next Steps

### Phase 2: Backend Audio Workers
- Implement Deepgram worker to receive LiveKit audio
- Create Groq/Whisper processing pipeline
- Set up result aggregation service

### Phase 3: Frontend Updates
- Replace direct mic access with LiveKit tracks
- Add third column for Groq results
- Update latency measurements

### Phase 4: Advanced Features
- Room recording capabilities
- Multi-participant support
- Real-time transcription sync

## Monitoring and Debugging

### Backend Logs
```bash
# Watch for token generation
tail -f backend_test.log | grep -E "Token|LiveKit"
```

### Frontend Console
- Check for WebRTC connection status
- Monitor audio track publishing
- Verify token format

### LiveKit Dashboard
- Monitor active rooms
- Check participant connections
- View usage metrics

## Security Considerations

1. **Token Expiration**: Tokens expire after 1 hour
2. **Room Permissions**: Participants can only join assigned rooms
3. **API Key Security**: Never expose keys in frontend code
4. **HTTPS Required**: Ensure production uses HTTPS for token requests

## Production Deployment

1. Use environment-specific `.env` files
2. Implement token refresh mechanism
3. Add error recovery and retries
4. Monitor WebSocket connection health
5. Implement graceful degradation

---

For additional help, see:
- [LiveKit Documentation](https://docs.livekit.io/)
- [LiveKit JavaScript SDK](https://docs.livekit.io/client-sdk-js/)
- `LIVEKIT_TEST.md` for testing procedures