import { AccessToken } from 'livekit-server-sdk';

export class LivekitService {
  private apiKey: string;
  private apiSecret: string;
  private livekitUrl: string;

  constructor() {
    this.apiKey = process.env.LIVEKIT_API_KEY || '';
    this.apiSecret = process.env.LIVEKIT_API_SECRET || '';
    this.livekitUrl = process.env.LIVEKIT_URL || '';

    if (!this.apiKey || !this.apiSecret || !this.livekitUrl) {
      throw new Error('LiveKit configuration is incomplete. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL');
    }
  }

  async createAccessToken(roomName: string, identity: string): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      ttl: 3600, // 1 hour
    });

    // Grant permissions for the room
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    console.log(`[LivekitService] Created access token for ${identity} in room ${roomName}`);
    return token.toJwt();
  }

  async createBackendToken(roomName: string): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: `backend-${roomName}`,
      ttl: 3600, // 1 hour
    });

    // Grant full permissions for backend
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: false, // Backend doesn't publish audio
      canSubscribe: true, // Backend subscribes to user audio
      canPublishData: true,
      roomAdmin: true, // Allow backend to manage room
    });

    console.log(`[LivekitService] Created backend token for room ${roomName}`);
    return token.toJwt();
  }

  validateRoom(roomName: string): boolean {
    // Validate room name format (alphanumeric and hyphens only)
    const roomNameRegex = /^[a-zA-Z0-9-]+$/;
    return roomNameRegex.test(roomName) && roomName.length <= 64;
  }

  generateRoomName(userId: string): string {
    // Generate a unique room name for the user session
    const timestamp = Date.now();
    return `voice-${userId}-${timestamp}`;
  }
}