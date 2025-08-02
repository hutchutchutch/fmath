import { Router } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export const voiceRouter = Router();

// Deepgram API configuration
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/projects';
const USE_DEEPGRAM_SIMULATOR = process.env.USE_DEEPGRAM_SIMULATOR === 'true';
const DEEPGRAM_SIMULATOR_PORT = process.env.DEEPGRAM_SIMULATOR_PORT || 8080;

// Get Deepgram configuration
voiceRouter.get('/deepgram/config', (req, res) => {
  if (USE_DEEPGRAM_SIMULATOR) {
    res.json({
      useSimulator: true,
      apiUrl: `http://localhost:${DEEPGRAM_SIMULATOR_PORT}`,
      token: 'simulator-token'
    });
  } else {
    res.json({
      useSimulator: false,
      apiUrl: 'https://api.deepgram.com/v1/listen',
      needsToken: true
    });
  }
});

// Generate a temporary Deepgram API key for client-side usage
voiceRouter.post('/deepgram/token', async (req, res) => {
  try {
    // If using simulator, return a mock token
    if (USE_DEEPGRAM_SIMULATOR) {
      return res.json({
        token: 'simulator-token',
        expiresIn: 3600,
        note: 'Using Deepgram simulator'
      });
    }

    if (!DEEPGRAM_API_KEY) {
      return res.status(500).json({
        error: 'Deepgram API key not configured'
      });
    }

    // For development, we'll pass the API key directly
    // In production, you should create temporary keys via Deepgram's API
    res.json({
      token: DEEPGRAM_API_KEY,
      expiresIn: 3600, // 1 hour
      note: 'In production, use temporary keys via Deepgram API'
    });
  } catch (error) {
    console.error('Error generating Deepgram token:', error);
    res.status(500).json({
      error: 'Failed to generate Deepgram token'
    });
  }
});