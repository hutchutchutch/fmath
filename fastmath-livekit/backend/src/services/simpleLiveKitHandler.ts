import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteAudioTrack,
  RemoteTrackPublication,
  AudioStream,
  TrackKind,
  AudioFrame
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { livekitConfig } from '../config/livekit';
import axios from 'axios';
import EventEmitter from 'events';

/**
 * Simplified LiveKit Audio Handler
 * This is a minimal implementation to debug audio frame reception
 */
export class SimpleLiveKitHandler extends EventEmitter {
  private room: Room | null = null;
  private audioBuffer: Buffer[] = [];
  private processingTimer: NodeJS.Timeout | null = null;
  private frameCount = 0;

  constructor() {
    super();
    console.log('🎙️ Simple LiveKit Handler initialized');
  }

  async joinRoom(roomName: string): Promise<void> {
    try {
      // Create access token
      const token = new AccessToken(
        livekitConfig.apiKey,
        livekitConfig.apiSecret,
        {
          identity: 'fastmath-backend-simple',
          name: 'FastMath Simple Bot',
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
      
      // Set up event handlers before connecting
      this.setupRoomHandlers();
      
      await this.room.connect(livekitConfig.url, jwt, {
        autoSubscribe: true,
        dynacast: true,
      });
      
      console.log(`✅ Connected to room: ${roomName}`);
      
    } catch (error) {
      console.error('❌ Failed to join room:', error);
      throw error;
    }
  }

  private setupRoomHandlers(): void {
    if (!this.room) return;

    this.room.on(RoomEvent.Connected, () => {
      console.log('🔗 Room connected event fired');
    });

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(`👤 Participant connected: ${participant.identity}`);
    });

    this.room.on(RoomEvent.TrackSubscribed, async (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      console.log(`📡 Track subscribed from ${participant.identity}:`, {
        trackSid: track.sid,
        kind: track.kind,
        muted: track.muted
      });

      if (track.kind === TrackKind.KIND_AUDIO) {
        console.log(`🎵 Setting up audio processing for ${participant.identity}`);
        await this.processAudioTrack(track, participant);
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log('🔌 Disconnected from room');
      this.cleanup();
    });
  }

  private async processAudioTrack(track: RemoteTrack, participant: RemoteParticipant): Promise<void> {
    try {
      console.log(`🔍 Track info:`, {
        sid: track.sid,
        kind: track.kind,
        muted: track.muted,
        streamState: track.stream_state,
        ffi_handle: (track as any).ffi_handle ? 'present' : 'absent'
      });
      
      // Cast to RemoteAudioTrack if needed
      const audioTrack = track as RemoteAudioTrack;
      
      // Create audio stream with default settings
      const stream = new AudioStream(audioTrack);
      console.log(`🎤 Created AudioStream for ${participant.identity}`);
      console.log(`🎤 Stream type:`, stream.constructor.name);
      console.log(`🎤 Stream locked:`, stream.locked);
      
      // Get reader for the stream
      const reader = stream.getReader();
      console.log(`📖 Got reader for audio stream`);
      console.log(`📖 Reader type:`, reader.constructor.name);
      
      // Start reading frames
      this.readAudioFrames(reader, participant.identity);
      
      // Start periodic processing
      this.startProcessingTimer();
      
    } catch (error: any) {
      console.error(`❌ Error processing audio track:`, error);
      console.error(`❌ Error stack:`, error.stack);
    }
  }

  private async readAudioFrames(reader: ReadableStreamDefaultReader<AudioFrame>, participantId: string): Promise<void> {
    console.log(`🚀 Starting to read audio frames from ${participantId}`);
    
    // Add a timeout check
    let lastReadTime = Date.now();
    const checkTimeout = setInterval(() => {
      const elapsed = Date.now() - lastReadTime;
      if (elapsed > 5000) {
        console.log(`⏰ No frames received for ${elapsed}ms from ${participantId}`);
      }
    }, 1000);
    
    try {
      console.log(`📖 About to start reading loop...`);
      
      while (true) {
        console.log(`🔄 Attempting to read frame...`);
        const readPromise = reader.read();
        
        const { done, value: frame } = await readPromise;
        lastReadTime = Date.now();
        
        console.log(`📦 Read result: done=${done}, hasFrame=${!!frame}`);
        
        if (done) {
          console.log(`📍 Stream ended for ${participantId}`);
          break;
        }
        
        if (!frame || !frame.data) {
          continue;
        }
        
        this.frameCount++;
        
        // Log every 50th frame to avoid spam
        if (this.frameCount % 50 === 0) {
          console.log(`🎧 Frame #${this.frameCount} from ${participantId}: ${frame.data.length} samples`);
        }
        
        // Convert audio frame to buffer
        const buffer = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
        
        // Check if audio is silence
        const isZeroAudio = buffer.every(byte => byte === 0);
        if (isZeroAudio && this.frameCount % 50 === 0) {
          console.log(`🔇 Frame #${this.frameCount} contains silence`);
        }
        
        this.audioBuffer.push(buffer);
        
        // Process when we have enough data (100ms worth at 48kHz = 4800 samples = 9600 bytes)
        const totalSize = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
        if (totalSize >= 9600) {
          await this.processAccumulatedAudio();
        }
      }
    } catch (error) {
      console.error(`❌ Error reading audio frames:`, error);
    } finally {
      clearInterval(checkTimeout);
      reader.releaseLock();
    }
  }

  private startProcessingTimer(): void {
    if (this.processingTimer) return;
    
    // Process any remaining audio every 500ms
    this.processingTimer = setInterval(async () => {
      if (this.audioBuffer.length > 0) {
        await this.processAccumulatedAudio();
      }
    }, 500);
  }

  private async processAccumulatedAudio(): Promise<void> {
    if (this.audioBuffer.length === 0) return;
    
    const combinedBuffer = Buffer.concat(this.audioBuffer);
    this.audioBuffer = []; // Clear buffer
    
    // Check if the entire buffer is silence
    const isAllSilence = combinedBuffer.every(byte => byte === 0);
    
    console.log(`🎤 Processing ${combinedBuffer.length} bytes of audio${isAllSilence ? ' (ALL SILENCE!)' : ''}`);
    
    try {
      // Send to Deepgram REST API
      const response = await axios.post(
        'https://api.deepgram.com/v1/listen',
        combinedBuffer,
        {
          headers: {
            'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'audio/raw',
          },
          params: {
            encoding: 'linear16',
            sample_rate: 48000,
            channels: 1,
            punctuate: false,
            numerals: true,
            language: 'en-US',
          },
        }
      );
      
      const result = response.data;
      if (result.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
        const transcript = result.results.channels[0].alternatives[0].transcript;
        console.log(`🎯 Deepgram transcription: "${transcript}"`);
        
        // Emit transcription event
        this.emit('transcription', {
          text: transcript,
          timestamp: Date.now(),
          confidence: result.results.channels[0].alternatives[0].confidence || 0
        });
      }
    } catch (error: any) {
      console.error(`❌ Deepgram API error:`, error.response?.data || error.message);
    }
  }

  private cleanup(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
    this.audioBuffer = [];
    this.frameCount = 0;
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    this.cleanup();
  }
}

// Export singleton
export const simpleLiveKitHandler = new SimpleLiveKitHandler();