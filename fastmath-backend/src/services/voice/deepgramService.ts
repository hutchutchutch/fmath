import { EventEmitter } from 'events';
import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { TranscriptionConfig } from '../../types/voice';

export class DeepgramService extends EventEmitter {
  private deepgram: any;
  private connection: LiveClient | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      throw new Error('DEEPGRAM_API_KEY is not configured');
    }
    this.deepgram = createClient(deepgramApiKey);
  }

  async startTranscription(config: TranscriptionConfig = {}): Promise<void> {
    try {
      // Default configuration optimized for low latency
      const transcriptionConfig = {
        model: config.model || 'nova',
        language: config.language || 'en-US',
        encoding: config.encoding || 'linear16',
        sample_rate: config.sampleRate || 48000,
        channels: config.channels || 1,
        interim_results: config.interimResults !== false, // Default to true
      };

      console.log('[DeepgramService] Starting transcription with config:', transcriptionConfig);
      
      this.connection = this.deepgram.listen.live(transcriptionConfig);

      // Set up event handlers
      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('[DeepgramService] Connection opened');
        this.emit('open');
        
        // Start keep-alive to prevent connection delays
        this.startKeepAlive();
      });

      this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const transcript = data.channel?.alternatives?.[0];
        if (transcript && transcript.transcript) {
          this.emit('transcription', {
            text: transcript.transcript,
            isFinal: data.is_final || false,
            confidence: transcript.confidence || 0,
            timestamp: Date.now()
          });
        }
      });

      this.connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('[DeepgramService] Connection closed');
        this.emit('close');
        this.stopKeepAlive();
      });

      this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        console.error('[DeepgramService] Error:', error);
        this.emit('error', error);
      });

    } catch (error) {
      console.error('[DeepgramService] Failed to start transcription:', error);
      throw error;
    }
  }

  sendAudio(audioData: Buffer): void {
    if (this.connection && this.connection.getReadyState() === 1) {
      this.connection.send(audioData);
    } else {
      console.warn('[DeepgramService] Connection not ready, skipping audio data');
    }
  }

  stop(): void {
    console.log('[DeepgramService] Stopping transcription');
    this.stopKeepAlive();
    
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
    }
  }

  private startKeepAlive(): void {
    // Send keep-alive every 3 seconds to prevent connection delays
    this.keepAliveInterval = setInterval(() => {
      if (this.connection && this.connection.getReadyState() === 1) {
        this.connection.keepAlive();
      }
    }, 3000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}