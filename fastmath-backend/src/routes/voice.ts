import express, { Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import { authenticate } from '../middleware/auth';
import { voiceService } from '../services/voice/voiceService';
import { setupSSE, SSEClient } from '../middleware/sse';

const router = express.Router();

// Map to store SSE connections
const sseConnections = new Map<string, SSEClient>();

// Create voice session and get token
router.post('/token', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { roomName, participantName } = req.body;
  
  if (!roomName || !participantName) {
    return res.status(400).json({ 
      success: false, 
      message: 'roomName and participantName are required' 
    });
  }

  try {
    const token = await voiceService.generateUserToken(roomName, participantName);
    
    res.json({
      success: true,
      token,
      url: process.env.LIVEKIT_URL
    });
  } catch (error) {
    console.error('[Voice Routes] Token generation failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate token' 
    });
  }
}));

// Create a new voice session
router.post('/session', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { userId, trackId } = req.body;
  
  if (!userId || !trackId) {
    return res.status(400).json({ 
      success: false, 
      message: 'userId and trackId are required' 
    });
  }

  try {
    const session = await voiceService.createVoiceSession(userId, trackId);
    
    res.json({
      success: true,
      sessionId: session.sessionId,
      roomName: session.roomName
    });
  } catch (error) {
    console.error('[Voice Routes] Session creation failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create voice session' 
    });
  }
}));

// Join voice room (backend joins to process audio)
router.post('/join-room', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { roomName, userId } = req.body;
  
  if (!roomName || !userId) {
    return res.status(400).json({ 
      success: false, 
      message: 'roomName and userId are required' 
    });
  }

  try {
    await voiceService.joinRoom(roomName, userId);
    
    res.json({
      success: true,
      message: 'Backend joined room successfully'
    });
  } catch (error) {
    console.error('[Voice Routes] Room join failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to join room' 
    });
  }
}));

// Stream transcriptions via SSE
router.get('/transcriptions/:sessionId', authenticate, (req: Request, res: Response) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    return res.status(400).json({ 
      success: false, 
      message: 'sessionId is required' 
    });
  }

  // Set up SSE
  const sseClient = setupSSE(req, res);
  sseConnections.set(sessionId, sseClient);

  // Set up transcription listener
  const transcriptionHandler = (data: any) => {
    if (data.sessionId === sessionId) {
      sseClient.send({
        type: 'transcription',
        data: data.transcription
      });
    }
  };

  const audioLevelHandler = (data: any) => {
    if (data.sessionId === sessionId) {
      sseClient.send({
        type: 'audioLevel',
        data: { level: data.level }
      });
    }
  };

  // Add listeners
  voiceService.on('transcription', transcriptionHandler);
  voiceService.on('audioLevel', audioLevelHandler);

  // Clean up on disconnect
  req.on('close', () => {
    voiceService.removeListener('transcription', transcriptionHandler);
    voiceService.removeListener('audioLevel', audioLevelHandler);
    sseConnections.delete(sessionId);
    console.log(`[Voice Routes] SSE connection closed for session ${sessionId}`);
  });
});

// End voice session
router.post('/end-session', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ 
      success: false, 
      message: 'sessionId is required' 
    });
  }

  try {
    await voiceService.endVoiceSession(sessionId);
    
    // Close SSE connection if exists
    const sseClient = sseConnections.get(sessionId);
    if (sseClient) {
      sseClient.close();
      sseConnections.delete(sessionId);
    }
    
    res.json({
      success: true,
      message: 'Voice session ended successfully'
    });
  } catch (error) {
    console.error('[Voice Routes] Session end failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to end voice session' 
    });
  }
}));

// Get session metrics
router.get('/metrics/:sessionId', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    return res.status(400).json({ 
      success: false, 
      message: 'sessionId is required' 
    });
  }

  const metrics = voiceService.getSessionMetrics(sessionId);
  
  if (!metrics) {
    return res.status(404).json({ 
      success: false, 
      message: 'Session not found' 
    });
  }

  res.json({
    success: true,
    metrics
  });
}));

export default router;