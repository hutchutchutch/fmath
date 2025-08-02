import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import EventEmitter from 'events';

class DeepgramService extends EventEmitter {
  private deepgram: any;
  private connection: any = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPGRAM_API_KEY is required');
    }
    this.deepgram = createClient(apiKey);
  }

  async startTranscription() {
    try {
      console.log('🔄 Starting Deepgram connection...');
      console.log('📝 Deepgram API Key:', process.env.DEEPGRAM_API_KEY ? 'Present' : 'Missing');
      
      // Start with minimal configuration
      this.connection = this.deepgram.listen.live({
        model: 'nova',  // Try regular nova model
        language: 'en-US',
        encoding: 'linear16',
        sample_rate: 48000,
        channels: 1,
      });

      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('🎙️ Deepgram connection opened');
        
        // Start keepalive to prevent connection delays
        this.keepAliveInterval = setInterval(() => {
          if (this.connection && this.connection.getReadyState() === 1) {
            this.connection.keepAlive();
          }
        }, 3000);
      });

      this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;
        
        if (transcript && transcript.trim()) {
          if (isFinal) {
            console.log(`📝 Deepgram final: ${transcript}`);
            this.emit('transcription', transcript);
          } else {
            console.log(`📝 Deepgram interim: ${transcript}`);
            // Emit interim results for faster feedback
            this.emit('interim', transcript);
          }
        }
      });

      this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        console.error('❌ Deepgram error:', error);
        console.error('Error details:', {
          message: error.message,
          statusCode: error.statusCode,
          url: error.url,
          type: error.type
        });
      });

      this.connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('🔌 Deepgram connection closed');
      });
      
      this.connection.on(LiveTranscriptionEvents.Metadata, (data: any) => {
        console.log('📊 Deepgram metadata:', data);
      });

      return this.connection;
    } catch (error) {
      console.error('Failed to start Deepgram transcription:', error);
      throw error;
    }
  }

  sendAudio(audioData: Buffer) {
    if (this.connection && this.connection.getReadyState() === 1) {
      this.connection.send(audioData);
    } else {
      console.warn('⚠️ Deepgram connection not ready, state:', this.connection?.getReadyState());
    }
  }

  stop() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
    }
  }
}

export const deepgramService = new DeepgramService();