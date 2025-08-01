# Latency Improvements

## Issues Found

1. **Deepgram Latency Calculation**: Was using `response.duration` (audio duration) instead of actual processing time
2. **No Speech Detection**: Backend didn't know when speech started, was calculating from first audio chunk
3. **Multiple Results**: Deepgram sends interim and final results, we were processing all of them
4. **No Silence Detection**: Timer wasn't resetting between utterances

## Fixes Applied

### 1. Speech Detection
Added amplitude-based speech detection in `audioStream.ts`:
- Detects when actual speech starts (amplitude > 500)
- Resets timer after 1 second of silence
- Only starts timing from first speech, not first audio chunk

### 2. Deepgram Result Filtering
- Now only processes FINAL results (`is_final: true`)
- Logs interim results for debugging but doesn't emit them
- Prevents duplicate transcriptions

### 3. Better Latency Tracking
- Tracks `firstAudioChunkTime` per speech session
- Resets on silence detection
- Calculates latency from speech start, not connection start

### 4. Room Name Consistency
- Fixed room name mismatch between frontend and backend
- All services now use the same room name

## Expected Improvements

### Before:
- Deepgram: 4-8 seconds
- Web Speech: 0.5-9 seconds (variable)
- Groq: Mostly "No input"

### After:
- Deepgram: Should be < 1 second
- Web Speech: More consistent
- Groq: Should work when speaking clearly

## Testing Tips

1. **Speak clearly** with pauses between numbers
2. **Wait for silence** between utterances (1 second)
3. **Watch backend logs** for:
   - "🎤 Speech detected, starting timer"
   - "🔄 Resetting speech timer due to silence"
   - "🎯 Deepgram FINAL transcription"

## Further Improvements Possible

1. **Adjustable silence threshold**: Currently hardcoded at amplitude < 500
2. **WebM timing**: Could add similar speech detection for Groq
3. **Frontend coordination**: Could send speech start event from frontend
4. **VAD (Voice Activity Detection)**: Use proper VAD library instead of amplitude