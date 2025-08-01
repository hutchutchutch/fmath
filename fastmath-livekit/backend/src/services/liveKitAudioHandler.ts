import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Track,
  TrackEvent,
  LocalParticipant,
  Participant,
  AudioFrame,
  AudioStream
} from '@livekit/rtc-node';
import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import { livekitConfig } from '../config/livekit';
import { audioRouter } from './audioRouter';
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
    
    // Listen for transcription results from audioRouter
    audioRouter.on('transcription', (result) => {
      console.log('🎯 LiveKit handler received transcription:', result);
      // Forward to room participants via data channel
      this.sendTranscriptionToRoom(result.roomName, result);
    });
    
    console.log('🎙️ LiveKit Audio Handler initialized');
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
      
      // Connect to room
      const url = livekitConfig.url.replace('http://', 'ws://').replace('https://', 'wss://');
      await room.connect(url, token.toJwt(), {
        autoSubscribe: true,
        dynacast: true,
      });
      
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
      
      // Track subscriptions will be handled by the TrackSubscribed event
    });

    // Handle track subscriptions for existing participants
    room.on(RoomEvent.TrackSubscribed, (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        console.log(`🎵 Subscribed to audio track from ${participant.identity}`);
        this.handleAudioTrack(track, participant, roomName);
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
      kind?: DataPacket_Kind
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
    
    // For @livekit/rtc-node, we need to start audio stream
    const stream = new AudioStream(track);
    
    stream.on('frameReceived', (frame: AudioFrame) => {
      try {
        // Get the raw PCM data from the frame
        const samples = frame.data;
        if (!samples || samples.length === 0) {
          return;
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
          this.processAudioBuffer(combinedBuffer.slice(0, targetBufferSize), roomName, participant.identity);
          
          // Keep any remaining data
          if (combinedBuffer.length > targetBufferSize) {
            buffers.push(combinedBuffer.slice(targetBufferSize));
          }
        }
      } catch (error) {
        console.error('Error processing audio frame:', error);
      }
    });

    // Clean up on track mute/unmute
    track.on('muted', () => {
      console.log(`🔇 Track muted for ${participant.identity}`);
    });
    
    track.on('unmuted', () => {
      console.log(`🔊 Track unmuted for ${participant.identity}`);
    });
    
    // Clean up when track ends
    track.on('ended', () => {
      console.log(`🛑 Track ended for ${participant.identity}`);
      stream.close();
    });
    
    // Alternative: Listen for audio level updates
    track.on('audioLevelUpdate', (level: number) => {
      // Can use this to detect speech activity
      if (level > 0.1) {
        console.log(`🔊 Audio level from ${participant.identity}: ${level}`);
      }
    });
  }

  /**
   * Process audio buffer - send to unified processor
   */
  private processAudioBuffer(
    audioBuffer: Buffer,
    roomName: string,
    participantId: string
  ): void {
    const timestamp = Date.now();
    
    console.log(`🎤 Processing audio buffer: ${audioBuffer.length} bytes from ${participantId}`);
    
    // Send directly to audio router for Deepgram processing
    console.log(`🎯 Forwarding LiveKit audio to audioRouter: ${audioBuffer.length} bytes`);
    audioRouter.emit('audioData', {
      roomName,
      participantId,
      trackId: 'livekit-audio',
      data: audioBuffer,
      timestamp,
      sampleRate: 48000, // LiveKit default
      channels: 1,
      samplesPerChannel: audioBuffer.length / 2,
    });
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