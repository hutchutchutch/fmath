import { Router } from 'express';
import WebSocket from 'ws';
import { Server as HTTPServer } from 'http';
import { audioRouter } from '../services/audioRouter';

const router = Router();

// WebSocket server for audio streaming
export function setupAudioStreamWebSocket(server: HTTPServer) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws/audio-stream'
  });

  wss.on('connection', async (ws, req) => {
    console.log('🔌 New audio stream WebSocket connection');
    
    // Extract room info from query params
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const roomName = url.searchParams.get('room') || 'default';
    const participantId = url.searchParams.get('participant') || 'unknown';
    
    console.log(`📡 Audio stream connected for room: ${roomName}, participant: ${participantId}`);
    
    // Track connection time for proper timestamp correlation
    const connectionTime = Date.now();
    
    // Ensure Deepgram is connected
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (deepgramKey && !audioRouter.getStatus().deepgram) {
      console.log('🔄 Connecting to Deepgram...');
      try {
        await audioRouter.connectDeepgram(deepgramKey);
        console.log('✅ Deepgram connected');
      } catch (error) {
        console.error('❌ Failed to connect to Deepgram:', error);
      }
    }
    
    let messageCount = 0;
    let firstAudioTime = 0;
    let silenceCount = 0;
    let firstMessageTime = 0;
    const CHUNK_DURATION_MS = 1024; // 16384 samples at 16kHz = 1024ms per chunk (OPTIMIZED)
    
    ws.on('message', (data) => {
      if (data instanceof Buffer) {
        messageCount++;
        
        // Track first message time for accurate timestamp calculation
        if (firstMessageTime === 0) {
          firstMessageTime = Date.now();
        }
        
        // Calculate estimated timestamp based on chunk index and duration
        const estimatedTimestamp = firstMessageTime + (messageCount - 1) * CHUNK_DURATION_MS;
        
        // Check for silence (very small audio values)
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let maxAmplitude = 0;
        for (let i = 0; i < data.length / 2; i++) {
          const sample = Math.abs(view.getInt16(i * 2, true));
          maxAmplitude = Math.max(maxAmplitude, sample);
        }
        
        // If audio is very quiet, it's likely silence
        // FIXED: Lowered threshold from 500 to 100 and increased timeout from 1s to 3s
        if (maxAmplitude < 100) {
          silenceCount++;
          if (silenceCount > 150) { // ~3 seconds of silence (was 50 = 1 second)
            // Don't immediately reset - wait for actual new speech
            if (firstAudioTime > 0 && Date.now() - firstAudioTime > 5000) {
              firstAudioTime = 0; // Reset for next utterance
              audioRouter.emit('resetSpeechTimer', {});
              console.log('🔇 Silence detected after 3s, resetting speech timer');
            }
          }
        } else {
          silenceCount = 0;
          if (firstAudioTime === 0) {
            firstAudioTime = Date.now();
            console.log('🎤 Speech detected, starting timer');
          }
        }
        
        // This is PCM16 data for Deepgram
        if (messageCount <= 5 || messageCount % 100 === 0) {
          console.log(`📤 PCM16 chunk #${messageCount} received for Deepgram, size: ${data.length} bytes`);
        }
        
        // Forward PCM16 audio data to audio router with improved timestamp
        audioRouter.emit('audioData', {
          roomName,
          participantId,
          trackId: 'websocket-audio',
          data: data,
          // Use firstAudioTime when speech is detected, otherwise use estimated timestamp
          timestamp: firstAudioTime || estimatedTimestamp,
          actualMessageTime: Date.now(),
          chunkIndex: messageCount,
          sampleRate: 16000, // 16kHz
          channels: 1,
          samplesPerChannel: data.length / 2, // 16-bit samples
        });
      }
    });
    
    ws.on('close', () => {
      console.log(`🔌 Audio stream disconnected for ${roomName}/${participantId}`);
    });
    
    ws.on('error', (error) => {
      console.error('❌ Audio stream WebSocket error:', error);
    });
  });
  
  console.log('✅ Audio stream WebSocket server setup complete');
}

// HTTP endpoint to check audio stream status
router.get('/status', (req, res) => {
  res.json({
    status: 'ready',
    audioRouterConnected: {
      deepgram: audioRouter.getStatus().deepgram
    }
  });
});

export default router;