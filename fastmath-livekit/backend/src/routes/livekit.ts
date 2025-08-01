import { Router } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { livekitConfig } from '../config/livekit';
import { roomManager } from '../services/livekitRoomManagerFixed';
import { audioRouter } from '../services/audioRouter';

const router = Router();

// Initialize webhook receiver
const webhookReceiver = new WebhookReceiver(
  livekitConfig.apiKey,
  livekitConfig.apiSecret
);

// LiveKit webhook endpoint
router.post('/webhook', async (req, res) => {
  try {
    // Get the raw body for signature verification
    const body = req.body;
    const signature = req.get('Authorization') || '';

    // Verify the webhook signature
    const event = await webhookReceiver.receive(body, signature);

    console.log('LiveKit webhook event:', event.event);

    switch (event.event) {
      case 'room_started':
        console.log(`Room started: ${event.room?.name}`);
        break;
      
      case 'room_finished':
        console.log(`Room finished: ${event.room?.name}`);
        break;
      
      case 'participant_joined':
        console.log(`Participant joined: ${event.participant?.identity} in room ${event.room?.name}`);
        break;
      
      case 'participant_left':
        console.log(`Participant left: ${event.participant?.identity} from room ${event.room?.name}`);
        break;
      
      case 'track_published':
        console.log(`Track published: ${event.track?.type} by ${event.participant?.identity}`);
        if (event.track?.type === 'AUDIO') {
          // Audio track published - could trigger audio processing here
          console.log('Audio track available for processing');
        }
        break;
      
      case 'track_unpublished':
        console.log(`Track unpublished: ${event.track?.type} by ${event.participant?.identity}`);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.event}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing LiveKit webhook:', error);
    res.status(400).json({ error: 'Invalid webhook' });
  }
});

// Join room endpoint - for server to subscribe to audio
router.post('/join-room', async (req, res) => {
  try {
    const { roomName } = req.body;
    
    if (!roomName) {
      return res.status(400).json({ error: 'Room name required' });
    }

    // Join the room to receive audio
    await roomManager.joinRoom(roomName, 'fastmath-server');
    
    // Connect to Deepgram if API key available
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (deepgramKey && !audioRouter.getStatus().deepgram) {
      await audioRouter.connectDeepgram(deepgramKey);
    }

    res.json({ 
      success: true, 
      roomName,
      services: audioRouter.getStatus()
    });
  } catch (error: any) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: error.message });
  }
});

// Leave room endpoint
router.post('/leave-room', async (req, res) => {
  try {
    const { roomName } = req.body;
    
    if (!roomName) {
      return res.status(400).json({ error: 'Room name required' });
    }

    await roomManager.leaveRoom(roomName);
    
    res.json({ success: true, roomName });
  } catch (error: any) {
    console.error('Error leaving room:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get audio routing status
router.get('/status', (req, res) => {
  const roomManagerStatus = {
    activeRooms: roomManager.getActiveRooms(),
  };
  
  const routerStatus = audioRouter.getStatus();
  
  res.json({
    rooms: roomManagerStatus,
    services: routerStatus,
  });
});

// Subscribe to transcription events via SSE
router.get('/transcriptions', (req, res) => {
  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Listen for transcription events
  const transcriptionHandler = (result: any) => {
    res.write(`data: ${JSON.stringify({ type: 'transcription', ...result })}\n\n`);
  };

  audioRouter.on('transcription', transcriptionHandler);

  // Clean up on client disconnect
  req.on('close', () => {
    audioRouter.off('transcription', transcriptionHandler);
  });
});

export { router as livekitRouter };