import { Router } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { livekitConfig } from '../config/livekit';
import { roomManager } from '../services/livekitRoomManagerFixed';
import { audioRouter } from '../services/audioRouter';
import { liveKitAudioHandler } from '../services/liveKitAudioHandler';

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

    console.log(`🏠 Backend joining LiveKit room: ${roomName}`);
    
    // Connect to Deepgram if API key available
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (deepgramKey && !audioRouter.getStatus().deepgram) {
      await audioRouter.connectDeepgram(deepgramKey);
    }
    
    // Join the LiveKit room as backend participant
    await liveKitAudioHandler.joinRoom(roomName);
    
    res.json({ 
      success: true, 
      roomName,
      services: audioRouter.getStatus(),
      backendJoined: true
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

    // For now, we're not using the backend to join LiveKit rooms
    console.log(`Leave room request for: ${roomName} (skipping backend leave)`);
    
    res.json({ success: true, roomName });
  } catch (error: any) {
    console.error('Error leaving room:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get audio routing status
router.get('/status', (req, res) => {
  const liveKitStatus = {
    activeRooms: liveKitAudioHandler.getActiveRooms(),
  };
  
  const routerStatus = audioRouter.getStatus();
  
  res.json({
    rooms: liveKitStatus,
    services: routerStatus,
  });
});

// Subscribe to transcription events via SSE
router.get('/transcriptions', (req, res) => {
  console.log('🔄 SSE transcription endpoint connected');
  
  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial connection message
  const connectedMsg = JSON.stringify({ type: 'connected' });
  console.log('📤 Sending SSE connected message:', connectedMsg);
  res.write(`data: ${connectedMsg}\n\n`);

  // Listen for transcription events
  const transcriptionHandler = (result: any) => {
    console.log('🎯 SSE transcriptionHandler called with:', result);
    
    const message = JSON.stringify({ type: 'transcription', ...result });
    console.log('📤 Sending SSE transcription message:', message);
    
    try {
      res.write(`data: ${message}\n\n`);
      console.log('✅ SSE message sent successfully');
    } catch (error) {
      console.error('❌ Error sending SSE message:', error);
    }
  };

  console.log('🎧 Registering transcription handler for SSE');
  audioRouter.on('transcription', transcriptionHandler);
  
  console.log('👥 Current transcription listeners:', audioRouter.listenerCount('transcription'));

  // Clean up on client disconnect
  req.on('close', () => {
    console.log('🔌 SSE client disconnected, cleaning up');
    audioRouter.off('transcription', transcriptionHandler);
    console.log('👥 Remaining transcription listeners:', audioRouter.listenerCount('transcription'));
  });
});

export { router as livekitRouter };