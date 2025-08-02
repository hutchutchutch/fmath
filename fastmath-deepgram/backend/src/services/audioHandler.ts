import { Room, RoomEvent, RemoteParticipant, RemoteTrack, RemoteAudioTrack, TrackKind, AudioStream, AudioFrame } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import EventEmitter from 'events';
import axios from 'axios';
import { getLivekitConfig } from '../config/livekit';
import { deepgramService } from './deepgramService';

class AudioHandler extends EventEmitter {
  private room: Room | null = null;
  private audioBuffers: Map<string, Buffer[]> = new Map();
  private cleanupFunctions: Map<string, () => void> = new Map();
  private lastAudioSentTime: number = 0;
  private isSpeaking: boolean = false;
  private silenceCount: number = 0;
  private speechStartTime: number = 0;

  async joinRoom(roomName: string): Promise<void> {
    try {
      const config = getLivekitConfig();
      
      // Create access token
      const token = new AccessToken(
        config.apiKey,
        config.apiSecret,
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
      
      console.log(`🔗 Connecting to room: ${roomName}`);
      
      // Set up event handlers
      this.setupEventHandlers();
      
      await this.room.connect(config.url, jwt);
      
      console.log(`✅ Connected to room: ${roomName}`);
      
    } catch (error) {
      console.error('❌ Failed to join room:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.TrackSubscribed, async (track: RemoteTrack, publication, participant: RemoteParticipant) => {
      console.log(`📡 Track subscribed from ${participant.identity}`);
      
      if (track.kind === TrackKind.KIND_AUDIO) {
        console.log(`🎵 Audio track detected, starting processing...`);
        
        const audioTrack = track as RemoteAudioTrack;
        
        // Start Deepgram transcription
        try {
          await deepgramService.startTranscription();
          // Wait a bit for connection to establish
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error('Failed to start Deepgram:', error);
        }
        
        // Listen for final transcriptions from Deepgram
        deepgramService.on('transcription', (transcript: string) => {
          const number = this.wordToNumber(transcript);
          const transcriptionTime = Date.now();
          const audioStartTime = this.speechStartTime || transcriptionTime;
          const latency = transcriptionTime - audioStartTime;
          
          console.log(`🎯 Final transcription: "${transcript}" -> ${number} (latency: ${latency}ms)`);
          
          this.emit('transcription', {
            text: transcript,
            number: number,
            timestamp: transcriptionTime,
            audioStartTime: audioStartTime,
            latency: latency,
            participantId: participant.identity,
            isFinal: true,
          });
        });
        
        // Listen for interim results for faster feedback
        deepgramService.on('interim', (transcript: string) => {
          const number = this.wordToNumber(transcript);
          const transcriptionTime = Date.now();
          const audioStartTime = this.speechStartTime || transcriptionTime;
          const latency = transcriptionTime - audioStartTime;
          
          console.log(`⚡ Interim transcription: "${transcript}" -> ${number} (latency: ${latency}ms)`);
          
          this.emit('transcription', {
            text: transcript,
            number: number,
            timestamp: transcriptionTime,
            audioStartTime: audioStartTime,
            latency: latency,
            participantId: participant.identity,
            isFinal: false,
          });
        });
        
        // Create audio stream with appropriate settings
        let stream: AudioStream;
        try {
          stream = new AudioStream(audioTrack, {
            sampleRate: 48000,
            numChannels: 1
          });
          console.log(`🎤 Created AudioStream for ${participant.identity}`);
        } catch (error) {
          console.error(`❌ Failed to create AudioStream:`, error);
          return;
        }
        
        // Initialize buffer for this participant
        const trackKey = `${participant.identity}`;
        this.audioBuffers.set(trackKey, []);
        
        // Create an async reader for the stream
        const reader = stream.getReader();
        console.log(`📖 Got stream reader for ${participant.identity}`);
        
        // Process audio frames
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
              
              if (frameCount % 100 === 1) {
                console.log(`🎧 Processing frame #${frameCount}`);
              }
              
              // Convert frame data to Buffer
              const buffer = this.frameToBuffer(frame);
              
              // Store in buffer
              const buffers = this.audioBuffers.get(trackKey)!;
              buffers.push(buffer);
              
              // Process every 10ms worth of audio (480 samples at 48kHz)
              // Ultra-low latency processing
              const targetBufferSize = 960; // 480 samples * 2 bytes per sample
              const totalSize = buffers.reduce((sum, buf) => sum + buf.length, 0);
              
              if (totalSize >= targetBufferSize) {
                const combinedBuffer = Buffer.concat(buffers);
                buffers.length = 0; // Clear buffer
                
                // Simple voice activity detection
                const hasAudio = this.detectVoiceActivity(combinedBuffer);
                
                if (hasAudio && !this.isSpeaking) {
                  // Speech just started
                  this.isSpeaking = true;
                  this.speechStartTime = Date.now();
                  console.log(`🎤 Speech detected at ${this.speechStartTime}`);
                } else if (!hasAudio && this.isSpeaking) {
                  this.silenceCount++;
                  if (this.silenceCount > 2) { // 20ms of silence (2 * 10ms)
                    this.isSpeaking = false;
                    this.silenceCount = 0;
                    console.log(`🔇 Speech ended`);
                  }
                } else if (hasAudio) {
                  this.silenceCount = 0;
                }
                
                // Send audio immediately to Deepgram
                const audioChunk = combinedBuffer.slice(0, targetBufferSize);
                deepgramService.sendAudio(audioChunk);
                
                // Keep remaining data
                if (combinedBuffer.length > targetBufferSize) {
                  buffers.push(combinedBuffer.slice(targetBufferSize));
                }
              }
            }
          } catch (error) {
            console.error('Error processing audio frames:', error);
          } finally {
            reader.releaseLock();
          }
        };
        
        // Start processing and store cleanup function
        processFrames();
        this.cleanupFunctions.set(trackKey, () => {
          reader.cancel();
          this.audioBuffers.delete(trackKey);
        });
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log('🔌 Disconnected from room');
    });
  }

  private detectVoiceActivity(buffer: Buffer): boolean {
    // Simple energy-based voice activity detection
    // Calculate RMS (Root Mean Square) of the audio signal
    let sum = 0;
    const samples = buffer.length / 2; // 16-bit samples
    
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      sum += sample * sample;
    }
    
    const rms = Math.sqrt(sum / samples);
    const threshold = 500; // Lower threshold for more sensitivity
    
    return rms > threshold;
  }
  
  private frameToBuffer(frame: AudioFrame): Buffer {
    // AudioFrame data is typically in PCM format already
    // The data property contains the raw audio samples
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
  
  private convertToPCM16(data: Float32Array | Uint8Array | Buffer): Buffer {
    // If it's already a Buffer, assume it's PCM16
    if (Buffer.isBuffer(data)) {
      return data;
    }
    
    // If it's a Float32Array, convert to PCM16
    if (data instanceof Float32Array) {
      const pcm16Buffer = Buffer.alloc(data.length * 2);
      
      for (let i = 0; i < data.length; i++) {
        // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
        const sample = Math.max(-1, Math.min(1, data[i]));
        const int16Sample = Math.floor(sample * 32767);
        pcm16Buffer.writeInt16LE(int16Sample, i * 2);
      }
      
      return pcm16Buffer;
    }
    
    // If it's a Uint8Array, return as Buffer
    if (data instanceof Uint8Array) {
      return Buffer.from(data);
    }
    
    throw new Error(`Unsupported audio data type`);
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
    this.audioBuffers.clear();
    
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    deepgramService.stop();
  }
}

export const audioHandler = new AudioHandler();