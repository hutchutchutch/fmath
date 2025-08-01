# Audio Debugging Steps

## Current Changes for Debugging

1. **Temporarily disabled sanitization** to see raw transcriptions
2. **Added extensive logging** in frontend and backend
3. **Fixed MediaRecorder cleanup** to prevent resource leaks
4. **Updated Deepgram parameters** to include interim_results
5. **Simplified Groq prompt** to avoid potential issues

## What to Check

### 1. Backend Console

When you restart the backend and test, look for:

```
✅ Groq service initialized
🔌 New audio stream WebSocket connection
📡 Audio stream connected for room: default, participant: user
🔄 Connecting to Deepgram...
✅ Connected to Deepgram WebSocket
```

Then when speaking:
```
📤 PCM16 chunk #1 received for Deepgram, size: 8192 bytes
🎵 Handling PCM16 audio data for Deepgram
📊 Deepgram: Sent 100.00 KB total
📨 Deepgram message: { type: 'Results', hasTranscript: true, transcript: '...' }

📹 WebM chunk #1 received for Groq, size: 45000 bytes
📹 WebM audio data received for Groq
🎯 Processing WebM chunk #1 with Groq
```

### 2. Browser Console

Look for:
```
✅ Connected to audio stream WebSocket
🎬 Starting MediaRecorder recording...
🛑 Stopping MediaRecorder recording...
📦 MediaRecorder stopped, chunks collected: 5
🎵 WebM blob size: 45632 bytes
📤 Sending WebM data to backend: 45637 bytes
```

### 3. Possible Issues

**If no PCM16 chunks:**
- ScriptProcessor might not be working
- Check browser compatibility
- Verify AudioContext is created properly

**If no WebM chunks:**
- MediaRecorder might not be supported
- Check if chunks are being collected
- Verify WebSocket is open when sending

**If no Deepgram responses:**
- Check API key is valid
- Verify WebSocket stays connected
- Look for error messages in Deepgram responses

**If no Groq responses:**
- Check API key is valid
- Verify WebM format is correct
- Check Groq error messages in logs

## Quick Test Commands

1. Check environment:
   ```bash
   ./check-env.sh
   ```

2. Test audio flow:
   ```bash
   ./test-audio-flow.sh
   ```

3. Monitor backend logs:
   ```bash
   cd backend && npm run dev | grep -E "(📤|📹|📝|🎵|📨|🔊)"
   ```

## Next Steps

1. Restart backend with new changes
2. Clear browser cache and reload
3. Grant microphone permissions
4. Speak clearly: "five", "twenty", "forty-two"
5. Watch both console outputs
6. Report which logs appear and which are missing

The disabled sanitization will help us see if Deepgram/Groq are transcribing anything at all, even if it's not numbers.