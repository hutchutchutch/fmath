export interface VoiceSession {
  sessionId: string;
  userId: string;
  roomName: string;
  trackId: string;
  startTime: Date;
  endTime?: Date;
  transcriptions: Transcription[];
}

export interface Transcription {
  id: string;
  text: string;
  timestamp: Date;
  latency: number;
  isFinal: boolean;
  confidence?: number;
  audioStartTime: number;
}

export interface VoiceMetrics {
  sessionId: string;
  averageLatency: number;
  totalTranscriptions: number;
  successRate: number;
}

export interface TranscriptionConfig {
  model?: 'nova' | 'nova-2';
  language?: string;
  encoding?: string;
  sampleRate?: number;
  channels?: number;
  interimResults?: boolean;
}

export interface VoiceConnection {
  userId: string;
  roomName: string;
  sessionId: string;
  active: boolean;
}

export interface VoiceTranscriptionEvent {
  text: string;
  latency: number;
  timestamp: number;
  isFinal: boolean;
  audioStartTime: number;
  participantId: string;
}