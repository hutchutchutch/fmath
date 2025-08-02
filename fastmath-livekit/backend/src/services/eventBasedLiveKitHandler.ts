import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  TrackKind,
  DataPacketKind,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { livekitConfig } from '../config/livekit';
import axios from 'axios';
import EventEmitter from 'events';

/**
 * Event-based LiveKit Audio Handler
 * This uses a different approach to capture audio
 */
export class EventBasedLiveKitHandler extends EventEmitter {
  private room: Room | null = null;
  private audioBuffer: Buffer[] = [];
  private processingTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    console.log('🎙️ Event-based LiveKit Handler initialized');
  }

  async joinRoom(roomName: string): Promise<void> {
    try {
      // Create access token
      const token = new AccessToken(
        livekitConfig.apiKey,
        livekitConfig.apiSecret,
        {
          identity: 'fastmath-backend-events',
          name: 'FastMath Event Bot',
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
      
      // Send a data message to confirm we're connected
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({
        type: 'backend-ready',
        service: 'event-based',
        timestamp: Date.now()
      }));
      
      await this.room.localParticipant?.publishData(data, { reliable: true });
      
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
        console.log(`🎵 Audio track detected from ${participant.identity}`);
        
        // Try to access the track directly
        console.log(`🔍 Track properties:`, {
          sid: track.sid,
          name: track.name,
          kind: track.kind,
          streamState: track.stream_state,
          muted: track.muted,
          hasFFIHandle: !!(track as any).ffi_handle
        });
        
        // Instead of AudioStream, let's try a different approach
        // Check if we can get audio data through the room's data channel
        console.log(`📊 Will monitor for audio data via alternative methods`);
        
        // Start a timer to periodically check for audio
        if (!this.processingTimer) {
          this.processingTimer = setInterval(() => {
            this.checkAudioStatus(participant.identity);
          }, 1000);
        }
      }
    });

    // Listen for data messages
    this.room.on(RoomEvent.DataReceived, (
      data: Uint8Array,
      participant?: RemoteParticipant,
      _?: DataPacketKind
    ) => {
      try {
        const decoder = new TextDecoder();
        const message = JSON.parse(decoder.decode(data));
        console.log(`📨 Data received from ${participant?.identity}:`, message);
      } catch (error) {
        // Might be binary audio data
        console.log(`🎵 Received binary data from ${participant?.identity}: ${data.length} bytes`);
      }
    });

    this.room.on(RoomEvent.Disconnected, () => {
      console.log('🔌 Disconnected from room');
      this.cleanup();
    });
  }

  private checkAudioStatus(participantId: string): void {
    console.log(`🔍 Checking audio status for ${participantId}`);
    
    // Log current room state
    if (this.room) {
      const participants = Array.from(this.room.remoteParticipants.values());
      console.log(`👥 Remote participants: ${participants.length}`);
      
      participants.forEach(p => {
        console.log(`  - ${p.identity}: tracks=${p.trackPublications.size}`);
        p.trackPublications.forEach((pub, sid) => {
          console.log(`    - Track ${sid}: subscribed=${pub.subscribed}, kind=${pub.kind}`);
        });
      });
    }
  }

  private cleanup(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
    this.audioBuffer = [];
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    this.cleanup();
  }

  // Test method to send fake transcription
  async sendTestTranscription(): Promise<void> {
    console.log('🧪 Sending test transcription');
    this.emit('transcription', {
      text: 'eleven',
      timestamp: Date.now(),
      confidence: 0.99
    });
  }
}

// Export singleton
export const eventBasedLiveKitHandler = new EventBasedLiveKitHandler();