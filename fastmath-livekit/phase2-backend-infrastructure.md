# Phase 2: Backend Infrastructure - Completed

## Overview

Phase 2 established the backend infrastructure needed for LiveKit audio routing and multi-service speech recognition. This phase built upon the token generation from Phase 1 to create a complete backend system.

## Completed Components

### 1. LiveKit Webhook Handler (`backend/src/routes/livekit.ts`)

**Purpose**: Track room events and participant activities

**Features**:
- Webhook signature verification for security
- Event handling for:
  - Room lifecycle (started/finished)
  - Participant events (joined/left)
  - Track events (published/unpublished)
- Audio track detection for triggering processing

**Webhook Events Monitored**:
```typescript
- room_started
- room_finished  
- participant_joined
- participant_left
- track_published (especially AUDIO tracks)
- track_unpublished
```

### 2. Groq/Whisper Service Module (`backend/src/services/groqService.ts`)

**Purpose**: Interface with Groq API for Whisper-based speech recognition

**Features**:
- Automatic initialization with API key validation
- Audio transcription with latency tracking
- Stream processing for continuous audio
- Number extraction from transcriptions
- Error handling and fallback support

**Key Methods**:
- `transcribeAudio()` - Process audio buffer and return text
- `processAudioStream()` - Handle continuous audio streams
- `extractNumberFromTranscription()` - Extract numbers from text
- `isAvailable()` - Check service status

### 3. Audio Format Converter (`backend/src/services/audioConverter.ts`)

**Purpose**: Convert between audio formats for compatibility

**Features**:
- FFmpeg-based conversion
- Support for common formats:
  - Opus → WAV (LiveKit to Groq)
  - WebM → WAV
  - Any format → WAV/MP3
- Stream-based conversion for real-time processing
- Format auto-detection
- FFmpeg availability checking

**Key Functions**:
- `convertAudio()` - Generic format conversion
- `opusToWav()` - LiveKit audio to Groq format
- `createConversionStream()` - Real-time conversion
- `prepareAudioForGroq()` - Automatic format preparation

## API Endpoints Added

### 1. LiveKit Webhook
```
POST /api/livekit/webhook
- Receives LiveKit event notifications
- Verifies webhook signatures
- Logs room and track events
```

### 2. Groq Test Endpoint
```
GET /api/groq/test
- Checks Groq service configuration
- Verifies API key presence
- Returns service availability
```

## Testing the Infrastructure

### 1. Test Groq Configuration
```bash
curl http://localhost:3001/api/groq/test
```

Expected response:
```json
{
  "configured": true,
  "hasApiKey": true,
  "apiKeyLength": 57
}
```

### 2. Configure LiveKit Webhooks

In your LiveKit Cloud dashboard:
1. Go to Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/api/livekit/webhook`
3. Select events to monitor
4. Save configuration

For local testing with ngrok:
```bash
ngrok http 3001
# Use the HTTPS URL for webhook configuration
```

## Dependencies Added

### Backend
- `groq-sdk` - Official Groq API client
- FFmpeg (system dependency) - Required for audio conversion

### Installation
```bash
# Install FFmpeg (macOS)
brew install ffmpeg

# Install FFmpeg (Ubuntu/Debian)
sudo apt-get install ffmpeg

# Verify installation
ffmpeg -version
```

## Architecture Flow

```
LiveKit Audio Track
    ↓
Backend Subscriber (Phase 3)
    ↓
Audio Buffer (Opus/WebM)
    ↓
Audio Converter (if needed)
    ↓
Parallel Processing:
├─→ Deepgram (WebSocket - existing)
└─→ Groq/Whisper (API - new)
```

## Error Handling

### Groq Service
- Graceful initialization failure if API key missing
- Per-request error handling with detailed messages
- Latency tracking even on failures

### Audio Converter
- FFmpeg availability checking
- Format detection with fallbacks
- Error messages for missing dependencies

### Webhook Handler
- Signature verification for security
- Invalid webhook rejection
- Comprehensive event logging

## Security Considerations

1. **Webhook Verification**: All LiveKit webhooks are verified using signatures
2. **API Key Protection**: Keys loaded from environment, never exposed
3. **Error Messages**: Sensitive information excluded from client responses

## Next Steps (Phase 3)

With the backend infrastructure complete, Phase 3 will:
1. Create LiveKit room manager for audio subscription
2. Implement audio routing to multiple services
3. Coordinate results from all three services
4. Set up real-time result streaming

## Troubleshooting

### "Groq service not initialized"
- Check `GROQ_API_KEY` in `.env`
- Verify key format and validity
- Check backend logs for initialization errors

### "FFmpeg not found"
- Install FFmpeg using package manager
- Verify installation: `ffmpeg -version`
- Restart backend after installation

### Webhook Not Receiving Events
- Verify webhook URL is publicly accessible
- Check LiveKit dashboard for webhook errors
- Ensure signature verification is working

---

Phase 2 successfully established the backend infrastructure for multi-service speech recognition. The system is now ready for Phase 3's audio routing implementation.