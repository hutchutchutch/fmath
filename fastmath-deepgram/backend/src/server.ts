import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

// Import routes AFTER env vars are loaded
import { livekitRouter } from './routes/livekit';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/livekit', livekitRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'fastmath-deepgram-backend' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Minimalist FastMath Deepgram backend running on port ${PORT}`);
  console.log(`🔑 LiveKit URL: ${process.env.LIVEKIT_URL}`);
  console.log(`🎙️ Deepgram API Key: ${process.env.DEEPGRAM_API_KEY ? 'Configured' : 'Missing'}`);
  
  // Debug: Show first few chars of API key
  if (process.env.DEEPGRAM_API_KEY) {
    console.log(`🔐 API Key prefix: ${process.env.DEEPGRAM_API_KEY.substring(0, 8)}...`);
  }
});