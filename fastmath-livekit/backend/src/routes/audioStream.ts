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
    let pcmMessageCount = 0;
    let webmMessageCount = 0;
    let firstAudioTime = 0;
    let silenceCount = 0;
    
    ws.on('message', (data) => {
      if (data instanceof Buffer) {
        messageCount++;
        
        // Check if this is WebM data (for Groq)
        const isWebM = data.length > 5 && data.toString('utf8', 0, 5) === 'WEBM:';
        
        if (isWebM) {
          webmMessageCount++;
          // Extract WebM data without the marker
          const webmData = data.slice(5);
          
          if (webmMessageCount <= 5 || webmMessageCount % 10 === 0) {
            console.log(`📹 WebM chunk #${webmMessageCount} received for Groq, size: ${webmData.length} bytes`);
          }
          
          // Send WebM data specifically for Groq
          audioRouter.emit('webmAudioData', {
            roomName,
            participantId,
            data: webmData,
            timestamp: Date.now(),
          });
        } else {
          pcmMessageCount++;
          
          // Check for silence (very small audio values)
          const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
          let maxAmplitude = 0;
          for (let i = 0; i < data.length / 2; i++) {
            const sample = Math.abs(view.getInt16(i * 2, true));
            maxAmplitude = Math.max(maxAmplitude, sample);
          }
          
          // If audio is very quiet, it's likely silence
          if (maxAmplitude < 500) {
            silenceCount++;
            if (silenceCount > 50) { // ~1 second of silence
              firstAudioTime = 0; // Reset for next utterance
              audioRouter.emit('resetSpeechTimer', {});
            }
          } else {
            silenceCount = 0;
            if (firstAudioTime === 0) {
              firstAudioTime = Date.now();
              console.log('🎤 Speech detected, starting timer');
            }
          }
          
          // This is PCM16 data for Deepgram
          if (pcmMessageCount <= 5 || pcmMessageCount % 100 === 0) {
            console.log(`📤 PCM16 chunk #${pcmMessageCount} received for Deepgram, size: ${data.length} bytes`);
          }
          
          // Forward PCM16 audio data to audio router
          audioRouter.emit('audioData', {
            roomName,
            participantId,
            trackId: 'websocket-audio',
            data: data,
            timestamp: firstAudioTime || Date.now(),
            sampleRate: 16000, // 16kHz
            channels: 1,
            samplesPerChannel: data.length / 2, // 16-bit samples
          });
        }
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
      deepgram: audioRouter.getStatus().deepgram,
      groq: audioRouter.getStatus().groq,
    }
  });
});

export default router;