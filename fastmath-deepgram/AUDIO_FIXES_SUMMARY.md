# Audio Processing Fixes Summary

## Changes Made

### 1. Backend Audio Stream Handler (`backend/src/routes/audioStream.ts`)
- Added logic to differentiate between PCM16 (for Deepgram) and WebM (for Groq) audio data
- PCM16 data is sent directly from the browser
- WebM data is prefixed with "WEBM:" marker and handled separately
- Added detailed logging to track audio chunk reception

### 2. Audio Router (`backend/src/services/audioRouter.ts`)
- Split audio handling into two separate paths:
  - `audioData` event for PCM16 → Deepgram streaming
  - `webmAudioData` event for WebM → Groq transcription
- Added `handleWebMAudioData()` method to process WebM chunks immediately
- Fixed participant ID and room name consistency (using 'user' and 'default')
- Added tracking counters for debugging:
  - `deepgramBytesSent`: Total bytes sent to Deepgram
  - `groqChunksProcessed`: Number of WebM chunks processed
- Enhanced Deepgram message logging to debug transcription flow

### 3. Frontend Audio Capture (`frontend/src/components/TripleVoiceInputDirect.tsx`)
- Already properly configured to:
  - Send PCM16 data via ScriptProcessor for Deepgram
  - Record WebM chunks via MediaRecorder for Groq
  - Mark WebM data with "WEBM:" prefix

## Testing Instructions

1. **Start the Backend**
   ```bash
   cd backend
   npm run dev
   ```

2. **Check Backend Logs for:**
   - ✅ Groq service initialized
   - 🔌 New audio stream WebSocket connection
   - ✅ Connected to Deepgram WebSocket
   - 📤 PCM16 chunk #1 received for Deepgram
   - 📹 WebM chunk #1 received for Groq

3. **Start the Frontend**
   ```bash
   cd frontend
   npm start
   ```

4. **Test Audio Input**
   - Click "Start" button
   - Speak a number clearly (e.g., "five", "twenty", "42")
   - Watch for transcriptions in all three columns

## Expected Backend Logs Flow

```
✅ Groq service initialized
🔌 New audio stream WebSocket connection
📡 Audio stream connected for room: default, participant: user
🔄 Connecting to Deepgram...
✅ Connected to Deepgram WebSocket
✅ Deepgram connected

[When speaking:]
📤 PCM16 chunk #1 received for Deepgram, size: 8192 bytes
🎵 Handling PCM16 audio data for Deepgram
📨 Deepgram message: { type: 'Results', hasTranscript: true, transcript: 'five' }
🎯 Deepgram transcription found: five
📝 DEEPGRAM transcription: { text: 'five', number: 5, latency: 100ms }
🚀 Emitting transcription event

[After 3 seconds:]
📹 WebM chunk #1 received for Groq, size: 45632 bytes
🎯 Processing WebM chunk #1 with Groq
✅ Groq transcription completed in 523ms
🔊 Groq WebM result: { text: 'five', error: undefined, latency: 523 }
📝 GROQ transcription: { text: 'five', number: 5, latency: 523ms }
🚀 Emitting transcription event
```

## Debugging Tips

1. **If Deepgram shows "No input":**
   - Check if PCM16 chunks are being received in backend
   - Verify Deepgram WebSocket is connected (should see "✅ Connected to Deepgram WebSocket")
   - Look for "📨 Deepgram message" logs

2. **If Groq shows "No input":**
   - Check if WebM chunks are being received (look for "📹 WebM chunk")
   - Verify Groq service initialized (should see "✅ Groq service initialized")
   - Check chunk size (should be > 10KB for 3-second recordings)

3. **Use the debug scripts:**
   - `./check-env.sh` - Verify API keys are set
   - `./test-audio-debug.sh` - See expected log flow

## Architecture Overview

```
Browser Microphone
    ↓
[MediaStream]
    ↓
┌─────────────────┬─────────────────┬──────────────────┐
│  Web Speech API │ ScriptProcessor │  MediaRecorder   │
│   (Browser)     │  (PCM16)        │  (WebM/Opus)     │
└─────────────────┴────────┬────────┴────────┬─────────┘
                           ↓                  ↓
                    [WebSocket]         [WebSocket]
                           ↓                  ↓
                    audioStream.ts    audioStream.ts
                           ↓                  ↓
                    audioRouter.ts    audioRouter.ts
                           ↓                  ↓
                 ┌─────────┴────────┬────────┴─────────┐
                 │   Deepgram WS    │   Groq API       │
                 │   (Streaming)    │   (Chunks)       │
                 └──────────────────┴──────────────────┘
                           ↓                  ↓
                    [Transcriptions via SSE]
                           ↓
                    Browser Display
```

## Next Steps

After restarting the backend with these changes:

1. Monitor the backend console for the expected log flow
2. Check that both PCM16 and WebM chunks are being received
3. Verify transcriptions are emitted and displayed in the UI
4. If issues persist, check:
   - Browser console for WebSocket connection errors
   - Network tab for SSE connection status
   - Backend logs for specific error messages