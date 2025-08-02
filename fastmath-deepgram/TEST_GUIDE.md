# FastMath Speech Test - Testing Guide

## Recent Changes

### 1. Fixed Web Speech API Restart Loop
- Now requests microphone permission once at the beginning
- Prevents multiple permission requests that were causing the restart loop
- Uses `abort()` instead of `stop()` during cleanup to prevent triggering `onend` event

### 2. Removed Deepgram Simulator
- Set `USE_DEEPGRAM_SIMULATOR=false` in backend `.env`
- Now connects to real Deepgram API at `wss://api.deepgram.com/v1/listen`
- Uses proper WebSocket subprotocol for authentication: `['token', YOUR_API_KEY]`

### 3. Timer Control
- Timer only starts when both Web Speech API and Deepgram are connected
- Shows "Waiting for services to connect..." message until ready
- Resets properly between problems

### 4. Visual Feedback
- Added microphone activity indicator (red pulse when active)
- Service status indicators (green dot when connected)
- Real-time transcription display for both services

## Testing Instructions

1. **Test the main app:**
   ```
   http://localhost:3000
   ```
   - Grant microphone permission when prompted
   - Verify both services show "Connected" status
   - Speak numbers clearly and check both transcription areas
   - Verify timer starts only after both services connect

2. **Test Web Speech API diagnostics:**
   ```
   http://localhost:3000?test=webspeech
   ```
   - This shows detailed event logs for Web Speech API
   - Useful for debugging speech recognition issues

## What to Look For

1. **No more restart loops** - Web Speech API should start once and stay active
2. **Microphone indicator** - Should pulse red when speaking
3. **Dual transcription** - Both services should show transcriptions
4. **Auto-submit** - Form submits when both have values OR after 5 seconds
5. **Timer behavior** - Should only count when both services are ready

## Console Logs

Key log messages to verify proper operation:
- `🎤 Requesting microphone permission...`
- `✅ Microphone permission granted`
- `✅ Web Speech API started`
- `✅ Deepgram WebSocket connected`
- `⏱️ Both services ready - starting timer`

## Troubleshooting

If Web Speech API still has issues:
1. Check browser console for errors
2. Try the diagnostic page at `?test=webspeech`
3. Ensure you're using Chrome/Edge (best Web Speech API support)
4. Check that microphone is not in use by other applications