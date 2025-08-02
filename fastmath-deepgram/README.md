# FastMath Deepgram Implementation

A new implementation of FastMath focused on testing LiveKit + Deepgram integration for real-time voice recognition in math exercises.

## Overview

This is a fresh copy of the fastmath-livekit repository, created to test a new approach for integrating LiveKit with Deepgram for audio transcription.

## Features

- LiveKit WebRTC for real-time audio capture
- Deepgram REST API for speech-to-text transcription
- Single-digit addition problems (0-9 + 0-9)
- 6-second timer per problem
- Automatic problem advancement
- Session tracking with 10 problems per session
- Voice vs keyboard input metrics
- Fallback to keyboard/touchpad input
- Sound-alike number recognition ("none" → 9, "to" → 2, etc.)

## Project Structure

```
fastmath-deepgram/
├── frontend/          # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── VoiceExerciseWithDeepgram.tsx    # Main exercise component
│   │   │   ├── VoiceInputLiveKit.tsx            # LiveKit voice input
│   │   │   ├── Timer.tsx                        # Visual timer component
│   │   │   └── TouchpadInput.tsx               # Number pad input
│   │   ├── App.tsx
│   │   └── index.tsx
│   └── package.json
├── backend/           # Express server
│   ├── src/
│   │   ├── routes/
│   │   │   ├── exercise.ts          # Exercise generation API
│   │   │   ├── livekit.ts          # LiveKit endpoints
│   │   │   └── voice.ts            # Deepgram endpoints
│   │   ├── services/
│   │   │   ├── exerciseService.ts  # Problem generation
│   │   │   └── Various LiveKit handlers
│   │   └── server.ts
│   └── package.json
└── README.md
```

## Quick Start

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Set up environment variables
cp .env.example .env
# Add your DEEPGRAM_API_KEY and LiveKit credentials

# Run both servers
./launch.sh

# Or run separately:
# Terminal 1:
cd backend && npm run dev

# Terminal 2:
cd frontend && npm start
```

## Environment Variables

Create a `.env` file in the project root:

```env
# Required
DEEPGRAM_API_KEY=your_deepgram_api_key

# LiveKit Configuration
LIVEKIT_URL=https://your-livekit-instance.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Optional
USE_DEEPGRAM_SIMULATOR=false
PORT=3001
```

## Development Notes

This repository is specifically for testing new LiveKit + Deepgram integration approaches. The main goal is to resolve the audio streaming issues encountered in the original implementation.

## Known Issues

- The original implementation had issues with the LiveKit Node.js SDK's AudioStream not providing audio frames
- This repository will explore alternative approaches to capture and process audio from LiveKit

## Testing

Access the application at http://localhost:3000 after starting both servers.

1. Click "Start" to begin the exercise
2. Allow microphone access when prompted
3. Speak your answers clearly
4. The system will auto-submit recognized numbers

## License

MIT