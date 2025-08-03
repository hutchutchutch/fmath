import { Room, RoomEvent, RemoteParticipant, RemoteTrack, RemoteAudioTrack, TrackKind, AudioStream } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import EventEmitter from 'events';
import { DeepgramService } from './deepgramService';

class AudioHandler extends EventEmitter {
  private room: Room | null = null;
  private deepgramService: DeepgramService;
  private cleanupFunctions: Map<string, () => void> = new Map();

  constructor() {
    super();
    this.deepgramService = new DeepgramService();
  }

  async joinRoom(roomName: string): Promise<void> {
    console.log(`🤖 [Backend] AudioHandler joining room: ${roomName}`);
    try {
      const apiKey = process.env.LIVEKIT_API_KEY!;
      const apiSecret = process.env.LIVEKIT_API_SECRET!;
      const url = process.env.LIVEKIT_URL!;
      
      console.log('🔑 [Backend] LiveKit config:', {
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
        url
      });
      
      // Create access token
      const token = new AccessToken(
        apiKey,
        apiSecret,
        {
          identity: 'fastmath-backend',
          name: 'FastMath Bot',
        }
      );
      
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canSubscribe: true,
        canPublish: false,
      });

      // Create and connect to room
      this.room = new Room();
      const jwt = await token.toJwt();
      
      console.log(`🔗 [Backend] Connecting to room: ${roomName}`);
      console.log(`🎫 [Backend] JWT token generated, length: ${jwt.length}`);
      
      // Set up event handlers
      this.setupEventHandlers();
      
      await this.room.connect(url, jwt);
      
      console.log(`✅ [Backend] Connected to room: ${roomName}`);
      console.log(`👥 [Backend] Room participant count:`, this.room.numParticipants);
      
    } catch (error) {
      console.error('❌ [Backend] Failed to join room:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.TrackSubscribed, async (track: RemoteTrack, publication, participant: RemoteParticipant) => {
      console.log(`📡 [Backend] Track subscribed from ${participant.identity}, kind: ${track.kind}`);
      console.log(`🔍 [Backend] Track details:`, {
        trackSid: track.sid,
        kind: track.kind
      });
      
      if (track.kind === TrackKind.KIND_AUDIO) {
        console.log(`🎵 [Backend] Audio track detected, starting processing...`);
        
        const audioTrack = track as RemoteAudioTrack;
        
        // Start Deepgram transcription
        try {
          console.log('🌊 [Backend] Starting Deepgram transcription service...');
          
          // Listen for Deepgram open event to emit backend ready
          this.deepgramService.once('open', () => {
            console.log('🚀 [Backend] Deepgram connected, emitting backend_ready');
            this.emit('backend_ready');
          });
          
          await this.deepgramService.startTranscription();
          // Wait a bit for connection to establish
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log('✅ [Backend] Deepgram service started');
        } catch (error) {
          console.error('❌ [Backend] Failed to start Deepgram:', error);
        }
        
        // Listen for transcriptions from Deepgram
        this.deepgramService.on('transcription', (data: any) => {
          const transcript = data.text;
          const number = this.wordToNumber(transcript);
          const transcriptionTime = Date.now();
          
          if (data.isFinal) {
            console.log(`🎯 [Backend] Final transcription: "${transcript}" -> ${number}`);
          } else {
            console.log(`⚡ [Backend] Interim transcription: "${transcript}" -> ${number}`);
          }
          
          this.emit('transcription', {
            text: transcript,
            number: number,
            timestamp: transcriptionTime,
            participantId: participant.identity,
            isFinal: data.isFinal,
            speechFinal: data.speechFinal || false, // Deepgram's endpointing signal
          });
        });
        
        // Create audio stream and process
        try {
          const stream = new AudioStream(audioTrack, {
            sampleRate: 48000,
            numChannels: 1
          });
          console.log(`🎤 [Backend] Created AudioStream for ${participant.identity}`);
          
          // Create an async reader for the stream
          const reader = stream.getReader();
          console.log(`📖 [Backend] Got stream reader for ${participant.identity}`);
          
          // Process audio frames - send directly to Deepgram without VAD
          const processFrames = async () => {
            try {
              let frameCount = 0;
              while (true) {
                const { done, value: frame } = await reader.read();
                if (done) {
                  console.log(`Stream ended for ${participant.identity}`);
                  break;
                }
                
                if (!frame || !frame.data) continue;
                
                frameCount++;
                
                if (frameCount % 1000 === 1) {
                  console.log(`🎧 [Backend] Processing frame #${frameCount} for ${participant.identity}`);
                }
                
                // Convert frame data to Buffer and send directly to Deepgram
                const buffer = this.frameToBuffer(frame);
                this.deepgramService.sendAudio(buffer);
              }
            } catch (error) {
              console.error('Error processing audio frames:', error);
            } finally {
              reader.releaseLock();
            }
          };
          
          // Start processing
          processFrames();
          
          // Store cleanup function
          const trackKey = `${participant.identity}`;
          this.cleanupFunctions.set(trackKey, () => {
            reader.cancel();
          });
          
        } catch (error) {
          console.error(`❌ Failed to create AudioStream:`, error);
          return;
        }
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log('🔌 [Backend] Disconnected from room');
    });
    
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log(`👥 [Backend] Participant connected: ${participant.identity}`);
    });
    
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log(`👤 [Backend] Participant disconnected: ${participant.identity}`);
    });
  }

  private frameToBuffer(frame: any): Buffer {
    // AudioFrame data is typically in PCM format already
    const data = frame.data;
    
    // If it's already a Buffer, return it
    if (Buffer.isBuffer(data)) {
      return data;
    }
    
    // If it's a Uint8Array, convert to Buffer
    if (data instanceof Uint8Array) {
      return Buffer.from(data);
    }
    
    // If it's any other typed array, convert to Buffer
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  

  private wordToNumber(text: string): number | null {
    // Clean up the text
    const cleaned = text.toLowerCase().trim();
    
    // Simple number words
    const simpleNumbers: { [key: string]: number } = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
      'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
      'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
      'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30,
      'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
      'eighty': 80, 'ninety': 90
    };
    
    // Check for simple numbers
    if (simpleNumbers[cleaned] !== undefined) {
      return simpleNumbers[cleaned];
    }
    
    // Check for compound numbers like "twenty-five"
    const parts = cleaned.split(/[\s-]+/);
    if (parts.length === 2) {
      const tens = simpleNumbers[parts[0]];
      const ones = simpleNumbers[parts[1]];
      if (tens !== undefined && ones !== undefined && tens >= 20 && tens <= 90 && ones >= 1 && ones <= 9) {
        return tens + ones;
      }
    }
    
    // Try to parse as a regular number
    const parsed = parseInt(cleaned);
    if (!isNaN(parsed)) {
      return parsed;
    }
    
    return null;
  }

  async disconnect(): Promise<void> {
    // Clean up all audio streams
    for (const [key, cleanup] of this.cleanupFunctions) {
      cleanup();
    }
    this.cleanupFunctions.clear();
    
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    this.deepgramService.stop();
  }
}

export const audioHandler = new AudioHandler();