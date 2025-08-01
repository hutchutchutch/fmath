# LiveKit Integration Test Guide

## Prerequisites

1. **LiveKit Cloud Account or Self-Hosted Server**
   - Sign up at https://cloud.livekit.io/ for a free cloud account
   - Or deploy your own LiveKit server

2. **Required API Keys in `.env`**
   ```
   LIVEKIT_API_KEY=your_api_key
   LIVEKIT_API_SECRET=your_api_secret
   LIVEKIT_URL=wss://your-project.livekit.cloud
   GROQ_API_KEY=your_groq_key
   DEEPGRAM_API_KEY=your_deepgram_key
   ```

## Running the Test

1. **Ensure dependencies are installed:**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   ```

2. **Run the test script:**
   ```bash
   ./livekit-test.sh
   ```

3. **Open browser to http://localhost:3000**

4. **Click "Connect to LiveKit"**

## What the Test Does

1. **Backend Verification**
   - Checks if LiveKit environment variables are configured
   - Validates API key and secret are present
   - Returns configuration status

2. **Token Generation**
   - Creates a JWT token for room access
   - Sets permissions for audio publishing
   - Token expires after 1 hour

3. **LiveKit Connection**
   - Connects to LiveKit room using WebRTC
   - Establishes secure connection to LiveKit server
   - Reports connection quality

4. **Audio Publishing**
   - Requests microphone permission
   - Creates local audio track
   - Publishes audio to LiveKit room

## Success Indicators

- ✅ "Backend configured" message
- ✅ Token received (first 20 chars shown)
- ✅ "Connected to LiveKit room!" status
- ✅ "Connected and publishing audio!" final status

## Troubleshooting

### "LiveKit not configured in backend"
- Check your `.env` file has all required LiveKit variables
- Ensure no quotes around the values in `.env`
- Restart the backend after updating `.env`

### "Cannot connect to backend"
- Ensure backend is running on port 3001
- Check `backend_test.log` for errors
- Try running backend manually: `cd backend && npm run dev`

### "Connection failed" after token received
- Verify LIVEKIT_URL is correct (should start with wss://)
- Check if your LiveKit server is accessible
- Ensure API key/secret match your LiveKit project
- Check browser console for WebRTC errors

### Microphone Permission Denied
- Browser will prompt for microphone access
- Must allow to test audio publishing
- Check browser settings if prompt doesn't appear

## Next Steps

After successful connection test:
1. Audio will be routed through LiveKit to multiple STT services
2. Implement Deepgram worker to receive LiveKit audio
3. Implement Groq/Whisper worker for parallel processing
4. Create unified results display