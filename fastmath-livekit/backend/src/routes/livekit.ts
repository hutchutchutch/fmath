import { Router } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { livekitConfig } from '../config/livekit';
import { roomManager } from '../services/livekitRoomManagerFixed';
import { transcriptionEmitter } from '../services/transcriptionEmitter';
import { liveKitAudioHandler } from '../services/liveKitAudioHandler';
import { simpleLiveKitHandler } from '../services/simpleLiveKitHandler';
import { eventBasedLiveKitHandler } from '../services/eventBasedLiveKitHandler';
import { liveKitDirectAudioHandler } from '../services/livekitDirectAudioHandler';

const router = Router();

// Simple number extraction function
function extractNumberFromText(text: string): number | null {
  const cleanText = text.toLowerCase().trim();
  
  // First try to find numeric digits
  const numberMatch = cleanText.match(/\b\d+\b/);
  if (numberMatch) {
    return parseInt(numberMatch[0]);
  }
  
  // Word to number mapping with sound-alikes
  const wordMap: { [key: string]: number } = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
    'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
    'eighteen': 18, 'nineteen': 19, 'twenty': 20,
    // Sound-alikes
    'to': 2, 'too': 2, 'tu': 2,
    'for': 4, 'fore': 4,
    'ate': 8, 'ait': 8,
    'none': 9, 'non': 9, 'nun': 9,
  };
  
  // Check for exact word matches
  for (const [word, num] of Object.entries(wordMap)) {
    if (cleanText === word) {
      return num;
    }
  }
  
  return null;
}

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
        if (event.track?.type === 0) { // 0 is AUDIO in the enum
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
    
    // Use LiveKit WebRTC for audio, not direct connections
    // const deepgramKey = process.env.DEEPGRAM_API_KEY;
    // if (deepgramKey && !audioRouter.getStatus().deepgram) {
    //   await audioRouter.connectDeepgram(deepgramKey);
    // }
    
    // Use direct audio handler for testing
    console.log('🔧 Using direct audio handler');
    await liveKitDirectAudioHandler.joinRoom(roomName);
    
    // Set up transcription forwarding
    liveKitDirectAudioHandler.on('transcription', (data) => {
      console.log('🎯 Forwarding transcription to SSE:', data);
      transcriptionEmitter.emitTranscription({
        service: 'deepgram',
        text: data.text,
        timestamp: data.timestamp,
        latency: Date.now() - data.timestamp,
        participantId: 'livekit-user',
        roomName: roomName,
        number: extractNumberFromText(data.text),
        isFinal: true,
        confidence: data.confidence
      });
    });
    
    // FALLBACK: Use event-based for comparison
    const useEventBased = false; // Toggle this to switch between handlers
    
    if (useEventBased) {
      console.log('🔧 Using simplified LiveKit handler for debugging');
      await simpleLiveKitHandler.joinRoom(roomName);
      
      // Set up transcription forwarding
      simpleLiveKitHandler.on('transcription', (data) => {
        console.log('🎯 Forwarding transcription to SSE:', data);
        transcriptionEmitter.emitTranscription({
          service: 'deepgram',
          text: data.text,
          timestamp: data.timestamp,
          latency: Date.now() - data.timestamp,
          participantId: 'livekit-user',
          roomName: roomName,
          number: extractNumberFromText(data.text),
          isFinal: true,
          confidence: data.confidence
        });
      });
    }
    
    res.json({ 
      success: true, 
      roomName,
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
  
  res.json({
    rooms: liveKitStatus,
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
  transcriptionEmitter.on('transcription', transcriptionHandler);
  
  console.log('👥 Current transcription listeners:', transcriptionEmitter.listenerCount('transcription'));

  // Clean up on client disconnect
  req.on('close', () => {
    console.log('🔌 SSE client disconnected, cleaning up');
    transcriptionEmitter.off('transcription', transcriptionHandler);
    console.log('👥 Remaining transcription listeners:', transcriptionEmitter.listenerCount('transcription'));
  });
});

export { router as livekitRouter };