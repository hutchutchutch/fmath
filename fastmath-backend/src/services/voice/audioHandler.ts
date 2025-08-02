import { EventEmitter } from 'events';
import { Room, RemoteAudioTrack, AudioStream, TrackEvent } from '@livekit/rtc-node';
import { DeepgramService } from './deepgramService';

export class AudioHandler extends EventEmitter {
  private room: Room | null = null;
  private deepgramService: DeepgramService;
  private speechStartTime: number = 0;
  private isSpeaking: boolean = false;
  private vadBuffer: number[] = [];
  private readonly VAD_THRESHOLD = 500;
  private readonly VAD_WINDOW_SIZE = 5;
  private audioStream: AudioStream | null = null;

  constructor(deepgramService: DeepgramService) {
    super();
    this.deepgramService = deepgramService;
  }

  async joinRoom(roomName: string, token: string): Promise<void> {
    try {
      console.log(`[AudioHandler] Joining room: ${roomName}`);
      
      this.room = new Room();
      
      await this.room.connect(process.env.LIVEKIT_URL || '', token);
      console.log(`[AudioHandler] Connected to room: ${roomName}`);

      // Listen for track subscribed events
      this.room.on(TrackEvent.TrackSubscribed, (track, publication, participant) => {
        if (track instanceof RemoteAudioTrack) {
          console.log(`[AudioHandler] Audio track subscribed from participant: ${participant.identity}`);
          this.processAudioTrack(track);
        }
      });

      // Listen for track unsubscribed events
      this.room.on(TrackEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track instanceof RemoteAudioTrack) {
          console.log(`[AudioHandler] Audio track unsubscribed from participant: ${participant.identity}`);
          this.stopAudioProcessing();
        }
      });

    } catch (error) {
      console.error('[AudioHandler] Failed to join room:', error);
      throw error;
    }
  }

  private async processAudioTrack(track: RemoteAudioTrack): Promise<void> {
    try {
      // Start Deepgram transcription
      await this.deepgramService.startTranscription();

      // Create audio stream with optimal settings for low latency
      this.audioStream = new AudioStream(track, {
        sampleRate: 48000,
        numChannels: 1
      });

      // Process audio in small chunks for low latency (10ms worth of audio)
      const targetBufferSize = 960; // 48000 Hz * 0.01s * 2 bytes/sample
      let audioBuffer = Buffer.alloc(0);

      this.audioStream.on('frameReceived', (frame: any) => {
        const pcm16Data = this.convertToPCM16(frame.data.buffer);
        audioBuffer = Buffer.concat([audioBuffer, pcm16Data]);

        // Process when we have enough data
        while (audioBuffer.length >= targetBufferSize) {
          const chunk = audioBuffer.slice(0, targetBufferSize);
          audioBuffer = audioBuffer.slice(targetBufferSize);

          // Voice Activity Detection
          const isActive = this.detectVoiceActivity(chunk);
          
          if (isActive && !this.isSpeaking) {
            this.isSpeaking = true;
            this.speechStartTime = Date.now();
            this.emit('speechStart', this.speechStartTime);
            console.log('[AudioHandler] Speech started');
          } else if (!isActive && this.isSpeaking) {
            this.isSpeaking = false;
            this.emit('speechEnd');
            console.log('[AudioHandler] Speech ended');
          }

          // Send audio to Deepgram
          this.deepgramService.sendAudio(chunk);
          
          // Emit audio level for visualization
          const audioLevel = this.calculateAudioLevel(chunk);
          this.emit('audioLevel', audioLevel);
        }
      });

      // Forward Deepgram transcriptions with latency calculation
      this.deepgramService.on('transcription', (data: any) => {
        const latency = this.speechStartTime ? Date.now() - this.speechStartTime : 0;
        
        this.emit('transcription', {
          text: data.text,
          isFinal: data.isFinal,
          latency,
          timestamp: data.timestamp,
          audioStartTime: this.speechStartTime
        });
      });

    } catch (error) {
      console.error('[AudioHandler] Failed to process audio track:', error);
      throw error;
    }
  }

  private stopAudioProcessing(): void {
    if (this.audioStream) {
      this.audioStream.removeAllListeners();
      this.audioStream = null;
    }
    this.deepgramService.stop();
  }

  private convertToPCM16(buffer: ArrayBuffer): Buffer {
    const float32Array = new Float32Array(buffer);
    const pcm16Buffer = Buffer.alloc(float32Array.length * 2);
    
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16Buffer.writeInt16LE(Math.floor(sample * 32767), i * 2);
    }
    
    return pcm16Buffer;
  }

  private detectVoiceActivity(buffer: Buffer): boolean {
    const rms = this.calculateRMS(buffer);
    
    // Add to rolling buffer
    this.vadBuffer.push(rms);
    if (this.vadBuffer.length > this.VAD_WINDOW_SIZE) {
      this.vadBuffer.shift();
    }
    
    // Check if average RMS exceeds threshold
    const avgRMS = this.vadBuffer.reduce((a, b) => a + b, 0) / this.vadBuffer.length;
    return avgRMS > this.VAD_THRESHOLD;
  }

  private calculateRMS(buffer: Buffer): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i) / 32768;
      sum += sample * sample;
    }
    return Math.sqrt(sum / (buffer.length / 2)) * 10000;
  }

  private calculateAudioLevel(buffer: Buffer): number {
    const rms = this.calculateRMS(buffer);
    // Convert to 0-100 scale
    return Math.min(100, Math.floor((rms / this.VAD_THRESHOLD) * 50));
  }

  async leaveRoom(): Promise<void> {
    console.log('[AudioHandler] Leaving room');
    this.stopAudioProcessing();
    
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }

  getSpeechStartTime(): number {
    return this.speechStartTime;
  }
}