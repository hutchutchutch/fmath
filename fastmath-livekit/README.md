# FastMath LiveKit Test Application

A simplified version of FastMath focused on testing voice input using LiveKit for real-time audio processing in math exercises. This application will demonstrate LiveKit integration for low-latency voice recognition.

## Features

- Dual voice recognition using Web Speech API and Deepgram simultaneously
- Real-time transcription comparison between both services
- Local Deepgram simulator for testing without API key
- Single-digit addition problems (0-9 + 0-9)
- 6-second timer per problem
- Automatic problem advancement
- Session tracking with 10 problems per session
- Voice vs keyboard input metrics
- Detailed comparison results table showing:
  - Transcription accuracy for each service
  - Latency measurements
  - Side-by-side results for each problem
- Fallback to keyboard/touchpad input

## Project Structure

```
fastmath-livekit/
├── frontend/          # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── VoiceExercise.tsx    # Main exercise component
│   │   │   ├── VoiceInput.tsx       # Voice-enabled input (from FastMath)
│   │   │   ├── Timer.tsx            # Visual timer component
│   │   │   └── TouchpadInput.tsx    # Number pad input
│   │   ├── App.tsx
│   │   └── index.tsx
│   └── package.json
├── backend/           # Express server
│   ├── src/
│   │   ├── routes/
│   │   │   ├── exercise.ts          # Exercise generation API
│   │   │   └── voice.ts             # Voice/Deepgram endpoints
│   │   ├── services/
│   │   │   └── exerciseService.ts   # Problem generation logic
│   │   └── server.ts
│   └── package.json
└── README.md
```

## Quick Start

```bash
# Launch both backend and frontend servers
./launch.sh

# The script will:
# - Install dependencies if needed
# - Create .env file from example
# - Start backend on http://localhost:3001
# - Start Deepgram simulator on ws://localhost:8080
# - Start frontend on http://localhost:3000
# - Show colored status messages
# - Monitor both servers

# To stop all servers
./stop.sh

# To test if servers are running correctly
./test-servers.sh
```

## Manual Setup Instructions

### Prerequisites

- Node.js 16+ and npm
- Modern browser with Web Speech API support (Chrome, Edge, Safari)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd fastmath-livekit/backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set:
   - `USE_DEEPGRAM_SIMULATOR=true` to use the local simulator (no API key needed)
   - `USE_DEEPGRAM_SIMULATOR=false` and add `DEEPGRAM_API_KEY` to use real Deepgram API

4. Start the development server:
   ```bash
   npm run dev
   ```

   The backend will run on http://localhost:3001
   If using the simulator, it will run on ws://localhost:8080

### Frontend Setup

1. In a new terminal, navigate to the frontend directory:
   ```bash
   cd fastmath-livekit/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the React development server:
   ```bash
   npm start
   ```

   The frontend will run on http://localhost:3000

## Usage

1. Open http://localhost:3000 in your browser
2. Click "Allow" when prompted for microphone access
3. The app will present 10 single-digit addition problems
4. For each problem:
   - Say your answer out loud (e.g., "five", "twenty-one")
   - Or type/click the answer using keyboard or touchpad
   - The timer shows 6 seconds per problem
   - Problems auto-advance after correct/incorrect feedback

## Voice Recognition

The application uses dual voice recognition systems:

### Web Speech API
- Browser-native voice recognition
- Continuous listening throughout the session
- Automatic number extraction from speech
- Support for both word numbers ("five") and digits

### Deepgram
- Cloud-based voice recognition via WebSocket
- Real-time streaming transcription
- Higher accuracy for complex audio
- Local simulator available for testing

### Comparison Features
- Side-by-side transcription results
- Latency measurements for both services
- Accuracy comparison per problem
- Session summary with overall statistics

## API Endpoints

### Backend API (http://localhost:3001)

- `GET /api/exercise/session/new` - Generate new exercise session
- `POST /api/exercise/session/:sessionId/result` - Save problem result
- `GET /api/exercise/session/:sessionId/results` - Get session results
- `GET /api/voice/deepgram/config` - Get Deepgram configuration
- `POST /api/voice/deepgram/token` - Get Deepgram token or simulator token

## Testing the Deepgram Simulator

To test the local Deepgram simulator:

1. Ensure `.env` has `USE_DEEPGRAM_SIMULATOR=true`
2. Start the backend: `npm run dev`
3. The simulator will start on ws://localhost:8080
4. Run the test script: `npx ts-node src/test-simulator.ts`

The simulator generates random number transcriptions (0-20) to simulate real speech recognition.

## Next Steps

1. **Production Deepgram Integration**
   - Implement temporary API key generation
   - Add error recovery and reconnection logic
   - Optimize WebSocket message batching

2. **Enhanced Metrics**
   - Add confidence score tracking
   - Implement word-level timing analysis
   - Create detailed analytics dashboard

3. **Production Deployment**
   - Environment configuration
   - Database integration for persistence
   - User authentication
   - WebSocket scaling considerations

## Troubleshooting

### Voice Recognition Not Working
- Ensure microphone permissions are granted
- Check browser console for errors
- Try the keyboard fallback option
- Verify you're using a supported browser

### Backend Connection Issues
- Ensure backend is running on port 3001
- Check CORS settings if deploying
- Verify API_URL environment variable

## Development Notes

This is a simplified extraction from the full FastMath application, focusing specifically on voice input functionality. The core voice logic is preserved from the original `QuestionTextInput` component while removing authentication, progress tracking, and other complex features.

Key files copied from FastMath:
- `VoiceInput.tsx` (adapted from `input.tsx`)
- `Timer.tsx` (visual timer component)
- `TouchpadInput.tsx` (number pad fallback)
- Core types and utilities