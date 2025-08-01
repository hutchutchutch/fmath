import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { exerciseRouter } from './routes/exercise';
import { voiceRouter } from './routes/voice';
import { livekitRouter } from './routes/livekit';
import audioStreamRoutes, { setupAudioStreamWebSocket } from './routes/audioStream';
// import { DeepgramSimulator } from './services/deepgramSimulator';
import dotenv from 'dotenv';
import { createToken, validateLiveKitConfig } from './config/livekit';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;
const DEEPGRAM_SIMULATOR_PORT = process.env.DEEPGRAM_SIMULATOR_PORT || 8080;
const USE_DEEPGRAM_SIMULATOR = process.env.USE_DEEPGRAM_SIMULATOR === 'true';

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/exercise', exerciseRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/livekit', livekitRouter);
app.use('/api/audio-stream', audioStreamRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// LiveKit token endpoint
app.post('/api/livekit/token', async (req, res) => {
  try {
    const { roomName = 'fastmath-test', participantName = 'user' } = req.body;
    console.log('Token request for room:', roomName, 'participant:', participantName);
    
    if (!validateLiveKitConfig()) {
      return res.status(500).json({ error: 'LiveKit not configured' });
    }
    
    const token = await createToken(roomName, participantName);
    console.log('Generated token type:', typeof token);
    console.log('Token length:', token?.length);
    console.log('Token preview:', token?.substring(0, 50) + '...');
    
    const response = { token, url: process.env.LIVEKIT_URL };
    console.log('Sending response:', JSON.stringify(response).substring(0, 100) + '...');
    
    res.json(response);
  } catch (error: any) {
    console.error('Error creating LiveKit token:', error);
    const errorMessage = error.message || 'Failed to create token';
    res.status(500).json({ error: errorMessage, details: error.toString() });
  }
});

// LiveKit test endpoint
app.get('/api/livekit/test', (req, res) => {
  const isConfigured = validateLiveKitConfig();
  res.json({ 
    configured: isConfigured,
    url: process.env.LIVEKIT_URL || 'Not configured',
    hasApiKey: !!process.env.LIVEKIT_API_KEY,
    hasApiSecret: !!process.env.LIVEKIT_API_SECRET,
    apiKeyLength: process.env.LIVEKIT_API_KEY?.length || 0,
    apiSecretLength: process.env.LIVEKIT_API_SECRET?.length || 0
  });
});


// Start Deepgram simulator if enabled
// let deepgramSimulator: DeepgramSimulator | null = null;
// if (USE_DEEPGRAM_SIMULATOR) {
//   deepgramSimulator = new DeepgramSimulator({
//     port: Number(DEEPGRAM_SIMULATOR_PORT),
//     simulateLatency: true,
//     latencyRange: { min: 50, max: 200 }
//   });
//   console.log(`Deepgram simulator enabled on port ${DEEPGRAM_SIMULATOR_PORT}`);
// }

// Setup WebSocket for audio streaming
setupAudioStreamWebSocket(server);

server.listen(PORT, () => {
  console.log(`Voice test backend running on port ${PORT}`);
  console.log(`Audio stream WebSocket available at ws://localhost:${PORT}/ws/audio-stream`);
  if (USE_DEEPGRAM_SIMULATOR) {
    console.log(`Deepgram simulator WebSocket available at ws://localhost:${DEEPGRAM_SIMULATOR_PORT}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    // if (deepgramSimulator) {
    //   deepgramSimulator.stop();
    // }
  });
});