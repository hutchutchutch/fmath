import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { exerciseRouter } from './routes/exercise';
import { voiceRouter } from './routes/voice';
// import { DeepgramSimulator } from './services/deepgramSimulator';
import dotenv from 'dotenv';

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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

server.listen(PORT, () => {
  console.log(`Voice test backend running on port ${PORT}`);
  if (USE_DEEPGRAM_SIMULATOR) {
    console.log(`Deepgram simulator WebSocket available at ws://localhost:${DEEPGRAM_SIMULATOR_PORT}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    if (deepgramSimulator) {
      deepgramSimulator.stop();
    }
  });
});