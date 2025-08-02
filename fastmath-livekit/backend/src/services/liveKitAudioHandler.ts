import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteAudioTrack,
  RemoteTrackPublication,
  Track,
  LocalParticipant,
  Participant,
  AudioFrame,
  AudioStream,
  DataPacketKind,
  TrackKind
} from '@livekit/rtc-node';
import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import { livekitConfig } from '../config/livekit';
import { transcriptionEmitter } from './transcriptionEmitter';
import EventEmitter from 'events';

/**
 * LiveKit Audio Handler for Backend
 * 
 * This service joins LiveKit rooms as a bot participant and processes
 * audio from other participants using the Node.js SDK.
 */
export class LiveKitAudioHandler extends EventEmitter {
  private roomClient: RoomServiceClient;
  private activeRooms: Map<string, Room> = new Map();
  private audioBuffers: Map<string, Buffer[]> = new Map();

  constructor() {
    super();
    
    this.roomClient = new RoomServiceClient(
      livekitConfig.url,
      livekitConfig.apiKey,
      livekitConfig.apiSecret
    );
    
    // Set up Deepgram processor
    this.setupDeepgramProcessor();
    
    console.log('🎙️ LiveKit Audio Handler initialized');
  }

  /**
   * Set up Deepgram processor for transcription
   */
  private setupDeepgramProcessor(): void {
    try {
      // Use the simple processor
      const { deepgramSimpleProcessor } = require('./deepgramSimpleProcessor');
      
      // Listen for transcriptions
      deepgramSimpleProcessor.on('transcription', (data: any) => {
        console.log('🎯 Received Deepgram transcription:', data);
        
        // Emit transcription event that will be picked up by SSE
        transcriptionEmitter.emitTranscription({
          service: 'deepgram',
          text: data.text,
          latency: data.latency,
          timestamp: data.timestamp,
          participantId: 'livekit-user',
          roomName: Array.from(this.activeRooms.keys())[0] || 'unknown',
          number: this.extractNumberFromText(data.text),
          isFinal: true,
          confidence: data.confidence
        });
      });
      
      console.log('✅ Deepgram processor ready');
    } catch (error) {
      console.error('Failed to set up Deepgram processor:', error);
    }
  }

  /**
   * Extract number from text (simple version)
   */
  private extractNumberFromText(text: string): number | null {
    const cleanText = text.toLowerCase().trim();
    const numberMatch = cleanText.match(/\b\d+\b/);
    if (numberMatch) {
      return parseInt(numberMatch[0]);
    }
    
    // Basic word to number mapping
    const wordMap: { [key: string]: number } = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
      'ten': 10, 'eleven': 11, 'twelve': 12
    };
    
    for (const [word, num] of Object.entries(wordMap)) {
      if (cleanText === word) {
        return num;
      }
    }
    
    return null;
  }

  /**
   * Join a room as the backend bot to process audio
   */
  async joinRoom(roomName: string): Promise<void> {
    try {
      // Check if already in room
      if (this.activeRooms.has(roomName)) {
        console.log(`Already in room: ${roomName}`);
        return;
      }

      // Create access token for backend participant
      console.log('🔑 Creating token with:', {
        apiKey: livekitConfig.apiKey ? `${livekitConfig.apiKey.substring(0, 8)}...` : 'missing',
        hasSecret: !!livekitConfig.apiSecret,
        url: livekitConfig.url
      });
      
      const token = new AccessToken(
        livekitConfig.apiKey,
        livekitConfig.apiSecret,
        {
          identity: 'fastmath-backend',
          name: 'FastMath Transcription Bot',
        }
      );
      
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canSubscribe: true,
        canPublish: false, // Backend doesn't publish audio
      });

      // Create room instance
      const room = new Room();
      
      // Setup event handlers
      this.setupRoomEventHandlers(room, roomName);
      
      // Connect to room - LiveKit Cloud URL is already in correct format
      const url = livekitConfig.url;
      const jwt = await token.toJwt(); // toJwt() is async!
      console.log(`🔗 Connecting to LiveKit at: ${url}`);
      console.log(`🎫 Token type: ${typeof jwt}`);
      console.log(`🎫 Token length: ${jwt.length}`);
      console.log(`🎫 Token preview: ${jwt.substring(0, 30)}...`);
      
      try {
        await room.connect(url, jwt, {
          autoSubscribe: true,
          dynacast: true,
        });
      } catch (connectError: any) {
        console.error('❌ Detailed connection error:', {
          message: connectError.message,
          code: connectError.code,
          type: connectError.constructor.name,
          stack: connectError.stack
        });
        throw connectError;
      }
      
      this.activeRooms.set(roomName, room);
      console.log(`✅ Backend joined room: ${roomName}`);
      
      // Notify that backend is ready
      this.emit('backendReady', { roomName });
      
    } catch (error) {
      console.error(`❌ Failed to join room ${roomName}:`, error);
      throw error;
    }
  }

  /**
   * Setup event handlers for a room
   */
  private setupRoomEventHandlers(room: Room, roomName: string): void {
    // Handle successful connection
    room.on(RoomEvent.Connected, () => {
      console.log(`🔗 Backend connected to room: ${roomName}`);
      
      // Send status update via data channel
      const data = new TextEncoder().encode(JSON.stringify({
        type: 'backend-connected',
        roomName,
        timestamp: Date.now()
      }));
      
      room.localParticipant?.publishData(data, { reliable: true });
    });

    // Handle new participants
    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(`👤 Participant connected: ${participant.identity}`);
      console.log(`  - Tracks published:`, participant.trackPublications.size);
      
      // Check existing tracks
      participant.trackPublications.forEach((publication, sid) => {
        console.log(`  - Existing track ${sid}:`, {
          kind: publication.kind,
          subscribed: publication.subscribed,
          track: publication.track ? 'available' : 'not available'
        });
      });
    });

    // Handle track publications
    room.on(RoomEvent.TrackPublished, (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      console.log(`📡 Track published by ${participant.identity}:`, {
        sid: publication.sid,
        kind: publication.kind,
        source: publication.source,
        muted: publication.muted,
        subscribed: publication.subscribed
      });
      
      // Try to subscribe if not already
      if (!publication.subscribed) {
        console.log(`  - Attempting to subscribe to track...`);
        publication.setSubscribed(true);
      }
    });

    // Handle track subscriptions
    room.on(RoomEvent.TrackSubscribed, (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      console.log(`✅ Successfully subscribed to track from ${participant.identity}:`, {
        trackSid: track.sid,
        kind: track.kind,
        muted: track.muted
      });
      
      if (track.kind === TrackKind.KIND_AUDIO) {
        console.log(`🎵 Setting up audio processing for track from ${participant.identity}`);
        this.handleAudioTrack(track, participant, roomName);
      } else {
        console.log(`  - Ignoring non-audio track (${track.kind})`);
      }
    });

    // Handle disconnection
    room.on(RoomEvent.Disconnected, () => {
      console.log(`🔌 Backend disconnected from room: ${roomName}`);
      this.activeRooms.delete(roomName);
    });

    // Handle data messages (for coordination)
    room.on(RoomEvent.DataReceived, (
      payload: Uint8Array,
      participant?: Participant,
      kind?: DataPacketKind
    ) => {
      try {
        const decoder = new TextDecoder();
        const message = JSON.parse(decoder.decode(payload));
        console.log(`📨 Data received from ${participant?.identity}:`, message);
      } catch (error) {
        console.error('Error parsing data message:', error);
      }
    });
  }

  /**
   * Handle incoming audio track
   */
  private handleAudioTrack(
    track: RemoteTrack,
    participant: RemoteParticipant,
    roomName: string
  ): void {
    const trackKey = `${roomName}-${participant.identity}`;
    
    // Initialize buffer for this participant
    if (!this.audioBuffers.has(trackKey)) {
      this.audioBuffers.set(trackKey, []);
    }
    
    // For @livekit/rtc-node, AudioStream is a ReadableStream<AudioFrame>
    let stream: AudioStream;
    try {
      stream = new AudioStream(track, {
        sampleRate: 48000,
        numChannels: 1
      });
      console.log(`🎤 Created AudioStream for ${participant.identity}`);
    } catch (error) {
      console.error(`❌ Failed to create AudioStream for ${participant.identity}:`, error);
      return;
    }
    console.log(`🎤 Track details:`, {
      sid: track.sid,
      kind: track.kind,
      muted: track.muted,
      ffi_handle: track.ffi_handle ? 'present' : 'not present',
      trackType: track.constructor.name,
      trackKeys: Object.keys(track)
    });
    
    // Create an async reader for the stream
    const reader = stream.getReader();
    console.log(`📖 Got stream reader for ${participant.identity}`);
    
    // Start processing audio frames
    (async () => {
      console.log(`🚀 Starting audio frame processing for ${participant.identity}`);
      let frameCount = 0;
      
      try {
        while (true) {
          const { done, value: frame } = await reader.read();
          if (done) {
            console.log(`Stream ended for ${participant.identity} after ${frameCount} frames`);
            break;
          }
          
          if (!frame) {
            console.log(`⚠️ Null frame received from ${participant.identity}`);
            continue;
          }
          
          frameCount++;
          if (frameCount % 100 === 1) { // Log every 100th frame to avoid spam
            console.log(`🎧 Received audio frame #${frameCount} from ${participant.identity}:`, {
              samples: frame.data?.length,
              timestamp: Date.now()
            });
          }
          
          try {
            // Get the raw PCM data from the frame
            const samples = frame.data;
            if (!samples || samples.length === 0) {
              continue;
            }
          
            // Convert Int16Array to Buffer
            const buffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
            
            // Store in buffer
            const buffers = this.audioBuffers.get(trackKey)!;
            buffers.push(buffer);
            
            // Process accumulated audio every 100ms (approximately 4800 samples at 48kHz)
            const samplesPerBuffer = 4800;
            const bytesPerSample = 2; // 16-bit audio
            const targetBufferSize = samplesPerBuffer * bytesPerSample;
            
            const totalSize = buffers.reduce((sum, buf) => sum + buf.length, 0);
            if (totalSize >= targetBufferSize) {
              const combinedBuffer = Buffer.concat(buffers);
              buffers.length = 0; // Clear buffer
              
              // Send to audio router for processing
              await this.processAudioBuffer(combinedBuffer.slice(0, targetBufferSize), roomName, participant.identity);
              
              // Keep any remaining data
              if (combinedBuffer.length > targetBufferSize) {
                buffers.push(combinedBuffer.slice(targetBufferSize));
              }
            }
          } catch (error) {
            console.error('Error processing audio frame:', error);
          }
        }
      } catch (error) {
        console.error('Error reading from audio stream:', error);
      } finally {
        reader.releaseLock();
      }
    })();
    
    console.log(`🎙️ Audio stream processing started for ${participant.identity}`);
  }

  /**
   * Process audio buffer - send to Deepgram
   */
  private async processAudioBuffer(
    audioBuffer: Buffer,
    roomName: string,
    participantId: string
  ): Promise<void> {
    const timestamp = Date.now();
    
    console.log(`🎤 Processing audio buffer: ${audioBuffer.length} bytes from ${participantId}`);
    
    try {
      // Use the simple processor to send directly to Deepgram
      const { deepgramSimpleProcessor } = require('./deepgramSimpleProcessor');
      await deepgramSimpleProcessor.processAudio(audioBuffer, 48000);
    } catch (error) {
      console.error('Failed to process audio:', error);
    }
  }

  /**
   * Send transcription result back to room
   */
  sendTranscriptionToRoom(
    roomName: string,
    transcription: any
  ): void {
    const room = this.activeRooms.get(roomName);
    if (!room) {
      console.error(`Not in room: ${roomName}`);
      return;
    }
    
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({
        type: 'transcription',
        ...transcription
      }));
      
      room.localParticipant?.publishData(data, { reliable: true });
      console.log(`📤 Sent transcription to room ${roomName}`);
    } catch (error) {
      console.error('Error sending transcription:', error);
    }
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomName: string): Promise<void> {
    const room = this.activeRooms.get(roomName);
    if (!room) {
      console.log(`Not in room: ${roomName}`);
      return;
    }
    
    try {
      await room.disconnect();
      this.activeRooms.delete(roomName);
      
      // Clean up buffers
      const keysToDelete = Array.from(this.audioBuffers.keys())
        .filter(key => key.startsWith(roomName));
      keysToDelete.forEach(key => this.audioBuffers.delete(key));
      
      console.log(`👋 Backend left room: ${roomName}`);
    } catch (error) {
      console.error(`Error leaving room ${roomName}:`, error);
    }
  }

  /**
   * Get active rooms
   */
  getActiveRooms(): string[] {
    return Array.from(this.activeRooms.keys());
  }

  /**
   * Disconnect from all rooms
   */
  async disconnectAll(): Promise<void> {
    const rooms = Array.from(this.activeRooms.keys());
    await Promise.all(rooms.map(roomName => this.leaveRoom(roomName)));
  }
}

// Export singleton instance
export const liveKitAudioHandler = new LiveKitAudioHandler();