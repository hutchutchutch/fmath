import express, { Request, Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { authenticate } from '../middleware/auth';
import { audioHandler } from '../services/voice/audioHandler';

const router = express.Router();

// Generate token for client
router.post('/token', authenticate as any, async (req: Request, res: Response): Promise<void> => {
  console.log('🎫 [Backend/Route] Token request received:', req.body);
  try {
    const { roomName, participantName } = req.body;
    
    if (!roomName || !participantName) {
      console.error('❌ [Backend/Route] Missing required params');
      res.status(400).json({ error: 'roomName and participantName required' });
      return;
    }

    const apiKey = process.env.LIVEKIT_API_KEY!;
    const apiSecret = process.env.LIVEKIT_API_SECRET!;
    
    const token = new AccessToken(
      apiKey,
      apiSecret,
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
    
    console.log('✅ [Backend/Route] Token generated successfully');
    res.json({ 
      token: jwt,
      url: process.env.LIVEKIT_URL 
    });
  } catch (error: any) {
    console.error('❌ [Backend/Route] Token generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Join room as backend bot
router.post('/join-room', authenticate as any, async (req: Request, res: Response): Promise<void> => {
  console.log('🤖 [Backend/Route] Join room request received:', req.body);
  try {
    const { roomName } = req.body;
    
    if (!roomName) {
      console.error('❌ [Backend/Route] Missing roomName');
      res.status(400).json({ error: 'roomName required' });
      return;
    }

    await audioHandler.joinRoom(roomName);
    
    console.log('✅ [Backend/Route] Backend successfully joined room');
    res.json({ 
      success: true,
      message: 'Backend joined room'
    });
  } catch (error: any) {
    console.error('❌ [Backend/Route] Join room error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SSE endpoint for transcriptions
router.get('/transcriptions', (req: Request, res: Response) => {
  console.log('📻 [Backend/Route] SSE connection requested');
  
  // Generate unique connection ID
  const connectionId = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`🆔 [Backend/Route] SSE connection ID: ${connectionId}`);
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  console.log('✅ [Backend/Route] SSE connection established');

  // Keep track of last sent message to prevent duplicates
  let lastInterimText = '';
  let lastInterimNumber: number | null = null;
  let lastFinalText = '';
  let lastFinalTimestamp = 0;
  
  // Listen for transcriptions
  const transcriptionHandler = (data: any) => {
    const now = Date.now();
    
    if (!data.isFinal) {
      // For interim results, only send if the text or number has changed
      if (data.text === lastInterimText && data.number === lastInterimNumber) {
        return;
      }
      lastInterimText = data.text;
      lastInterimNumber = data.number;
    } else {
      // For final results, prevent duplicate within 500ms window
      if (data.text === lastFinalText && (now - lastFinalTimestamp) < 500) {
        console.log(`⏭️ [Backend/Route] Skipping duplicate final transcription: "${data.text}"`);
        return;
      }
      lastFinalText = data.text;
      lastFinalTimestamp = now;
      // Reset interim tracking on final result
      lastInterimText = '';
      lastInterimNumber = null;
    }
    
    console.log(`📤 [Backend/Route] Sending transcription via SSE [${connectionId}]:`, {
      text: data.text,
      number: data.number,
      isFinal: data.isFinal,
      speechFinal: data.speechFinal,
      latency: data.latency
    });
    res.write(`data: ${JSON.stringify({ type: 'transcription', ...data })}\n\n`);
  };

  audioHandler.on('transcription', transcriptionHandler);
  console.log(`🎙️ [Backend/Route] Listening for transcriptions from audioHandler [${connectionId}]`);

  // Listen for backend ready event
  const backendReadyHandler = () => {
    console.log(`🚀 [Backend/Route] Backend ready signal received [${connectionId}]`);
    res.write(`data: ${JSON.stringify({ type: 'backend_ready' })}

`);
  };
  
  audioHandler.on('backend_ready', backendReadyHandler);

  // Clean up on disconnect
  req.on('close', () => {
    console.log(`🔌 [Backend/Route] SSE connection closed [${connectionId}]`);
    audioHandler.off('transcription', transcriptionHandler);
    audioHandler.off('backend_ready', backendReadyHandler);
  });
});

export default router;