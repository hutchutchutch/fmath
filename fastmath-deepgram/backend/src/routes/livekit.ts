import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { getLivekitConfig } from '../config/livekit';
import { audioHandler } from '../services/audioHandler';

const router = Router();

// Generate token for client
router.post('/token', async (req, res) => {
  try {
    const { roomName, participantName } = req.body;
    
    if (!roomName || !participantName) {
      return res.status(400).json({ error: 'roomName and participantName required' });
    }

    const config = getLivekitConfig();
    
    const token = new AccessToken(
      config.apiKey,
      config.apiSecret,
      {
        identity: participantName,
        name: participantName,
      }
    );

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();
    
    res.json({ 
      token: jwt,
      url: config.url 
    });
  } catch (error: any) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Join room as backend bot
router.post('/join-room', async (req, res) => {
  try {
    const { roomName } = req.body;
    
    if (!roomName) {
      return res.status(400).json({ error: 'roomName required' });
    }

    await audioHandler.joinRoom(roomName);
    
    res.json({ 
      success: true,
      message: 'Backend joined room'
    });
  } catch (error: any) {
    console.error('Join room error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint for transcriptions
router.get('/transcriptions', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Listen for transcriptions
  const transcriptionHandler = (data: any) => {
    res.write(`data: ${JSON.stringify({ type: 'transcription', ...data })}\n\n`);
  };

  audioHandler.on('transcription', transcriptionHandler);

  // Clean up on disconnect
  req.on('close', () => {
    audioHandler.off('transcription', transcriptionHandler);
  });
});

export { router as livekitRouter };