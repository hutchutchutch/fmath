# Saturday Deepgram/LiveKit Implementation Flow

## Overview
This document describes the current audio data flow and processing pipeline for the FastMath voice recognition system using LiveKit and Deepgram as of Saturday, January 2025.

## Architecture Components

### Frontend (React)
- **VoiceInputLiveKit Component** (`/fastmath/src/components/TestVoiceAssessment/VoiceInputLiveKit.tsx`)
- **SimpleVoiceTest Component** (`/fastmath/src/components/TestVoiceAssessment/SimpleVoiceTest.tsx`)

### Backend (Express)
- **Voice Routes** (`/fastmath-backend/src/routes/voice.ts`)
- **Audio Handler** (`/fastmath-backend/src/services/voice/audioHandler.ts`)
- **Deepgram Service** (`/fastmath-backend/src/services/voice/deepgramService.ts`)

## Detailed Flow Sequence

### 1. Initial Page Load & Setup

```
User navigates to /test-voice-assessment
↓
SimpleVoiceTest component renders
↓
Shows "Get Ready!" screen (if voiceEnabled && !isReady)
↓
VoiceInputLiveKit component mounts
```

### 2. Microphone Permission & SSE Setup

```
VoiceInputLiveKit useEffect on mount:
├── requestMicrophonePermission()
│   └── navigator.mediaDevices.getUserMedia({ audio: true })
│       └── Sets hasPermission = true/false
│
└── startTranscriptionMonitoring()
    └── Creates EventSource connection to http://localhost:3000/voice/transcriptions
        └── Backend assigns unique connectionId: sse-{timestamp}-{random}
```

### 3. LiveKit Connection Process

```
When hasPermission === true:
├── connectToLiveKit() triggered by useEffect
│   ├── Generates room name: test-room-{timestamp}
│   ├── POST http://localhost:3000/voice/token
│   │   └── Backend creates JWT with LiveKit credentials
│   │
│   ├── Creates new Room() instance
│   ├── Connects to LiveKit cloud (wss://voice-i5e0rl2c.livekit.cloud)
│   ├── On connection success:
│   │   ├── Sets isConnected = true
│   │   ├── Calls onConnectionChange?.(true)
│   │   │   └── SimpleVoiceTest sets isReady = true
│   │   │       └── Transitions from "Get Ready!" to first question
│   │   │
│   │   ├── Creates local audio tracks
│   │   ├── Publishes audio track to room
│   │   └── Sets up Web Audio API for level monitoring
│   │
│   └── POST http://localhost:3000/voice/join-room
│       └── Backend joins as "fastmath-backend" participant
```

### 4. Backend Audio Processing Pipeline

```
Backend joins LiveKit room:
├── audioHandler.joinRoom(roomName)
│   ├── Creates LiveKit Room instance
│   ├── Subscribes to remote audio tracks
│   │
│   └── On audio track subscription:
│       ├── Starts Deepgram transcription service
│       │   └── Configuration:
│       │       - model: 'nova'
│       │       - interim_results: true
│       │       - endpointing: 300ms
│       │       - vad_events: true
│       │
│       ├── Creates AudioStream from track (48kHz, mono)
│       ├── Processes audio in 10ms chunks (960 bytes)
│       │
│       └── For each chunk:
│           ├── Voice Activity Detection (VAD)
│           │   └── RMS threshold: 300
│           ├── If speech detected:
│           │   └── Send to Deepgram via WebSocket
│           └── Deepgram returns transcriptions
│               └── Emit 'transcription' event
```

### 5. Transcription Flow

```
Deepgram transcription received:
├── Backend audioHandler processes:
│   ├── Extracts text from transcript
│   ├── Runs wordToNumber() conversion
│   ├── Calculates latency metrics
│   └── Emits transcription event with:
│       - text: "thirteen"
│       - number: 13
│       - isFinal: false/true
│       - latency: 3-100ms (interim) / 100-600ms (final)
│       - timestamp: Date.now()
│       - audioStartTime: speechStartTime
│
└── SSE endpoint broadcasts to all connections:
    └── Filters duplicates:
        - Skips identical interim results
        - Tracks lastInterimText to prevent duplicates
```

### 6. Frontend Transcription Processing

```
EventSource receives transcription:
├── VoiceInputLiveKit processes:
│   ├── Updates latency display
│   ├── Extracts number from text (if not already done)
│   └── Calls onTranscript(numberString)
│       │
│       └── SimpleVoiceTest.handleVoiceTranscript():
│           ├── Checks if showFeedback (ignores if true)
│           ├── Validates number (0-100)
│           ├── Sets userAnswer state
│           └── If length matches expected answer:
│               └── Calls handleAnswer()
│                   ├── Shows feedback
│                   └── After 1s: moves to next question
```

## Connection Lifecycle

### Persistent Connections
1. **SSE Connection**: Created on component mount, persists entire session
2. **LiveKit Room**: Connected after permission granted, maintained throughout assessment
3. **Deepgram WebSocket**: Backend maintains connection while in LiveKit room

### Connection States
- **Pre-assessment**: "Get Ready!" screen while connecting
- **During assessment**: All connections active, processing interim results
- **Between questions**: Connections remain active (no disconnect/reconnect)
- **Post-assessment**: Connections closed on component unmount

## Latency Optimization

### Current Optimizations:
1. **Interim Results**: Process immediately (3-100ms typical latency)
2. **10ms Audio Chunks**: Minimal buffering delay
3. **VAD Threshold 300**: Sensitive speech detection
4. **Deepgram endpointing 300ms**: Faster end-of-speech detection
5. **Single SSE Connection**: No reconnection overhead
6. **Persistent LiveKit Room**: No reconnection between questions

### Data Flow Latencies:
- User speaks → LiveKit → Backend: ~10-20ms
- Backend → Deepgram → Transcription: ~3-100ms (interim)
- Backend → SSE → Frontend: ~1-5ms
- Frontend processing → UI update: ~1-5ms
- **Total typical latency**: 15-130ms

## Current Issues to Address

1. **Auto-submission**: ✅ FIXED - Now uses Deepgram's speech_final property
2. **Duplicate transcriptions**: ✅ FIXED - Improved filtering with time windows
3. **Connection timing**: ✅ FIXED - Backend ready handshake implemented
4. **State management**: Feedback state blocking new transcriptions

## Recent Improvements (January 2025)

1. **Removed Custom VAD**: Eliminated redundant voice activity detection, sending audio directly to Deepgram
2. **Speech Final Auto-submission**: Using Deepgram's speech_final property instead of length matching
3. **Backend Ready Signal**: Added backend_ready event to ensure full pipeline readiness
4. **Enhanced Duplicate Filtering**: Separate tracking for interim vs final results with time windows

## Port Configuration

- **Frontend**: http://localhost:3001
- **Backend**: http://localhost:3000
- **Voice Routes**: /voice/* (not /api/voice/*)

## Environment Variables

### Backend (.env)
```
LIVEKIT_URL=wss://voice-i5e0rl2c.livekit.cloud
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
DEEPGRAM_API_KEY=<key>
PORT=3000
```

## Key Files and Their Roles

1. **VoiceInputLiveKit.tsx**: Manages LiveKit connection, audio capture, SSE listening
2. **SimpleVoiceTest.tsx**: Handles assessment logic, answer validation, state management
3. **voice.ts**: API endpoints for tokens, room joining, SSE streaming
4. **audioHandler.ts**: LiveKit room management, audio processing, Deepgram integration
5. **deepgramService.ts**: Deepgram WebSocket connection and transcription handling