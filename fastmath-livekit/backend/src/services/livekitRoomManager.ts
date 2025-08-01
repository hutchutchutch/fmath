import { Room, RoomEvent, RemoteTrack, RemoteAudioTrack, DataPacket_Kind, TrackEvent } from 'livekit-server-sdk';
import { livekitConfig } from '../config/livekit';
import EventEmitter from 'events';

export interface AudioData {
  participantId: string;
  trackId: string;
  data: Buffer;
  timestamp: number;
}

export class LiveKitRoomManager extends EventEmitter {
  private rooms: Map<string, Room> = new Map();
  private audioStreams: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    console.log('🎙️ LiveKit Room Manager initialized');
  }

  /**
   * Join a room and subscribe to audio tracks
   */
  async joinRoom(roomName: string, identity: string = 'fastmath-server'): Promise<Room> {
    try {
      // Check if already in room
      if (this.rooms.has(roomName)) {
        console.log(`Already connected to room: ${roomName}`);
        return this.rooms.get(roomName)!;
      }

      // Create new room instance
      const room = new Room();

      // Set up event handlers before connecting
      this.setupRoomEventHandlers(room, roomName);

      // Connect to room
      console.log(`🔌 Connecting to LiveKit room: ${roomName}`);
      await room.connect(livekitConfig.url, identity, {
        autoSubscribe: true,
      });

      // Store room reference
      this.rooms.set(roomName, room);

      console.log(`✅ Connected to room: ${roomName} as ${identity}`);
      return room;
    } catch (error) {
      console.error(`❌ Failed to join room ${roomName}:`, error);
      throw error;
    }
  }

  /**
   * Leave a room and cleanup
   */
  async leaveRoom(roomName: string): Promise<void> {
    const room = this.rooms.get(roomName);
    if (!room) {
      console.log(`Not connected to room: ${roomName}`);
      return;
    }

    try {
      // Disconnect from room
      await room.disconnect();
      
      // Cleanup audio streams
      this.audioStreams.forEach((timeout, key) => {
        if (key.startsWith(roomName)) {
          clearInterval(timeout);
          this.audioStreams.delete(key);
        }
      });

      // Remove room reference
      this.rooms.delete(roomName);
      
      console.log(`👋 Left room: ${roomName}`);
    } catch (error) {
      console.error(`Error leaving room ${roomName}:`, error);
    }
  }

  /**
   * Set up event handlers for a room
   */
  private setupRoomEventHandlers(room: Room, roomName: string): void {
    // Room connected
    room.on(RoomEvent.Connected, () => {
      console.log(`🟢 Room connected: ${roomName}`);
      console.log(`  Participants: ${room.participants.size}`);
    });

    // Room disconnected
    room.on(RoomEvent.Disconnected, (reason?: string) => {
      console.log(`🔴 Room disconnected: ${roomName}, reason: ${reason}`);
      this.emit('roomDisconnected', { roomName, reason });
    });

    // Track subscribed - this is where we get audio
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant) => {
      console.log(`🎵 Track subscribed: ${track.kind} from ${participant.identity}`);
      
      if (track.kind === 'audio') {
        this.handleAudioTrack(track as RemoteAudioTrack, participant.identity, roomName);
      }
    });

    // Track unsubscribed
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication, participant) => {
      console.log(`🔇 Track unsubscribed: ${track.kind} from ${participant.identity}`);
      
      if (track.kind === 'audio') {
        this.stopAudioStream(`${roomName}-${participant.identity}-${track.sid}`);
      }
    });

    // Participant joined
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log(`👤 Participant joined: ${participant.identity}`);
      this.emit('participantJoined', { roomName, participant: participant.identity });
    });

    // Participant left
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log(`👤 Participant left: ${participant.identity}`);
      this.emit('participantLeft', { roomName, participant: participant.identity });
    });

    // Data received (could be used for metadata)
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant, kind) => {
      if (kind === DataPacket_Kind.RELIABLE) {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          console.log(`📊 Data received from ${participant?.identity}:`, data);
          this.emit('dataReceived', { roomName, participant: participant?.identity, data });
        } catch (error) {
          console.error('Error parsing data packet:', error);
        }
      }
    });

    // Connection quality changed
    room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      console.log(`📶 Connection quality for ${participant.identity}: ${quality}`);
    });

    // Room metadata updated
    room.on(RoomEvent.RoomMetadataChanged, (metadata) => {
      console.log(`📝 Room metadata updated:`, metadata);
    });
  }

  /**
   * Handle incoming audio track
   */
  private handleAudioTrack(track: RemoteAudioTrack, participantId: string, roomName: string): void {
    const streamKey = `${roomName}-${participantId}-${track.sid}`;
    
    console.log(`🎤 Starting audio stream for ${participantId} in ${roomName}`);

    // Attach event listener for audio frames
    track.on(TrackEvent.AudioFrame, (frame) => {
      // Convert audio frame to buffer
      const audioBuffer = Buffer.from(frame.data);
      
      // Emit audio data event
      this.emit('audioData', {
        roomName,
        participantId,
        trackId: track.sid,
        data: audioBuffer,
        timestamp: Date.now(),
        sampleRate: frame.sampleRate,
        channels: frame.channels,
        samplesPerChannel: frame.samplesPerChannel,
      });
    });

    // Start receiving audio
    track.start();

    // Store reference for cleanup
    const checkInterval = setInterval(() => {
      if (!track.isEnabled) {
        console.log(`🔇 Audio track disabled for ${participantId}`);
        this.stopAudioStream(streamKey);
      }
    }, 5000);

    this.audioStreams.set(streamKey, checkInterval);
  }

  /**
   * Stop audio stream
   */
  private stopAudioStream(streamKey: string): void {
    const interval = this.audioStreams.get(streamKey);
    if (interval) {
      clearInterval(interval);
      this.audioStreams.delete(streamKey);
      console.log(`🛑 Stopped audio stream: ${streamKey}`);
    }
  }

  /**
   * Send data to a room
   */
  async sendData(roomName: string, data: any): Promise<void> {
    const room = this.rooms.get(roomName);
    if (!room || room.state !== 'connected') {
      console.error(`Cannot send data - not connected to room: ${roomName}`);
      return;
    }

    try {
      const payload = new TextEncoder().encode(JSON.stringify(data));
      await room.localParticipant.publishData(payload, DataPacket_Kind.RELIABLE);
      console.log(`📤 Sent data to room ${roomName}:`, data);
    } catch (error) {
      console.error(`Error sending data to room ${roomName}:`, error);
    }
  }

  /**
   * Get list of active rooms
   */
  getActiveRooms(): string[] {
    return Array.from(this.rooms.keys());
  }

  /**
   * Get room instance
   */
  getRoom(roomName: string): Room | undefined {
    return this.rooms.get(roomName);
  }

  /**
   * Disconnect from all rooms
   */
  async disconnectAll(): Promise<void> {
    console.log('🔌 Disconnecting from all rooms...');
    
    const roomNames = Array.from(this.rooms.keys());
    await Promise.all(roomNames.map(roomName => this.leaveRoom(roomName)));
    
    console.log('✅ Disconnected from all rooms');
  }
}

// Export singleton instance
export const roomManager = new LiveKitRoomManager();