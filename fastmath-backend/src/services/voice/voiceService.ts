import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { DeepgramService } from './deepgramService';
import { LivekitService } from './livekitService';
import { AudioHandler } from './audioHandler';
import { VoiceSession, VoiceConnection, Transcription } from '../../types/voice';

export class VoiceService extends EventEmitter {
  private deepgramService: DeepgramService;
  private livekitService: LivekitService;
  private activeConnections: Map<string, VoiceConnection>;
  private sessions: Map<string, VoiceSession>;
  private audioHandlers: Map<string, AudioHandler>;

  constructor() {
    super();
    this.deepgramService = new DeepgramService();
    this.livekitService = new LivekitService();
    this.activeConnections = new Map();
    this.sessions = new Map();
    this.audioHandlers = new Map();
  }

  async createVoiceSession(userId: string, trackId: string): Promise<VoiceSession> {
    try {
      const sessionId = uuidv4();
      const roomName = this.livekitService.generateRoomName(userId);

      // Create session
      const session: VoiceSession = {
        sessionId,
        userId,
        roomName,
        trackId,
        startTime: new Date(),
        transcriptions: []
      };

      this.sessions.set(sessionId, session);

      // Create connection tracking
      const connection: VoiceConnection = {
        userId,
        roomName,
        sessionId,
        active: true
      };

      this.activeConnections.set(userId, connection);

      console.log(`[VoiceService] Created voice session ${sessionId} for user ${userId}`);
      return session;

    } catch (error) {
      console.error('[VoiceService] Failed to create voice session:', error);
      throw error;
    }
  }

  async generateUserToken(roomName: string, participantName: string): Promise<string> {
    return this.livekitService.createAccessToken(roomName, participantName);
  }

  async joinRoom(roomName: string, userId: string): Promise<void> {
    try {
      const connection = this.activeConnections.get(userId);
      if (!connection || connection.roomName !== roomName) {
        throw new Error('Invalid room or no active session');
      }

      // Create backend token
      const backendToken = await this.livekitService.createBackendToken(roomName);

      // Create new audio handler for this session
      const audioHandler = new AudioHandler(this.deepgramService);
      this.audioHandlers.set(connection.sessionId, audioHandler);

      // Set up transcription event forwarding
      audioHandler.on('transcription', (data: any) => {
        const session = this.sessions.get(connection.sessionId);
        if (session) {
          const transcription: Transcription = {
            id: uuidv4(),
            text: data.text,
            timestamp: new Date(),
            latency: data.latency,
            isFinal: data.isFinal,
            confidence: data.confidence,
            audioStartTime: data.audioStartTime
          };

          session.transcriptions.push(transcription);

          // Emit transcription event with session info
          this.emit('transcription', {
            sessionId: connection.sessionId,
            userId,
            transcription
          });
        }
      });

      // Set up audio level forwarding
      audioHandler.on('audioLevel', (level: number) => {
        this.emit('audioLevel', {
          sessionId: connection.sessionId,
          userId,
          level
        });
      });

      // Join the room
      await audioHandler.joinRoom(roomName, backendToken);
      console.log(`[VoiceService] Backend joined room ${roomName} for user ${userId}`);

    } catch (error) {
      console.error('[VoiceService] Failed to join room:', error);
      throw error;
    }
  }

  async endVoiceSession(sessionId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Update session end time
      session.endTime = new Date();

      // Clean up audio handler
      const audioHandler = this.audioHandlers.get(sessionId);
      if (audioHandler) {
        await audioHandler.leaveRoom();
        audioHandler.removeAllListeners();
        this.audioHandlers.delete(sessionId);
      }

      // Remove active connection
      this.activeConnections.delete(session.userId);

      console.log(`[VoiceService] Ended voice session ${sessionId}`);

    } catch (error) {
      console.error('[VoiceService] Failed to end voice session:', error);
      throw error;
    }
  }

  getActiveSession(userId: string): VoiceConnection | undefined {
    return this.activeConnections.get(userId);
  }

  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionMetrics(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const latencies = session.transcriptions
      .filter(t => t.isFinal)
      .map(t => t.latency);

    return {
      sessionId,
      averageLatency: latencies.length > 0 
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
        : 0,
      totalTranscriptions: session.transcriptions.filter(t => t.isFinal).length,
      successRate: 100 // Can be calculated based on error tracking
    };
  }

  // Clean up inactive sessions
  cleanupInactiveSessions(): void {
    const now = Date.now();
    const INACTIVE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.sessions) {
      if (!session.endTime) continue;
      
      const sessionAge = now - session.endTime.getTime();
      if (sessionAge > INACTIVE_TIMEOUT) {
        this.sessions.delete(sessionId);
        console.log(`[VoiceService] Cleaned up inactive session ${sessionId}`);
      }
    }
  }
}

// Create singleton instance
export const voiceService = new VoiceService();

// Clean up inactive sessions every 10 minutes
setInterval(() => {
  voiceService.cleanupInactiveSessions();
}, 10 * 60 * 1000);