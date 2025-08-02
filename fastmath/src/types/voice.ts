export interface VoiceInputConfig {
  onTranscription: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  onAudioLevel?: (level: number) => void;
  language?: string;
  model?: 'nova' | 'nova-2';
}

export interface VoiceTranscriptionEvent {
  text: string;
  latency: number;
  timestamp: number;
  isFinal: boolean;
  audioStartTime: number;
  participantId: string;
}

export interface VoiceSessionResponse {
  success: boolean;
  sessionId?: string;
  roomName?: string;
  message?: string;
}

export interface VoiceTokenResponse {
  success: boolean;
  token?: string;
  url?: string;
  message?: string;
}

export interface TranscriptionData {
  id: string;
  text: string;
  timestamp: string;
  latency: number;
  isFinal: boolean;
  confidence?: number;
  audioStartTime: number;
}

export interface AudioLevelData {
  level: number;
}