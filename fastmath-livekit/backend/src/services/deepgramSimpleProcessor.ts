import axios from 'axios';
import EventEmitter from 'events';

/**
 * Simple Deepgram processor that sends audio to REST API
 * without complex buffering or timers that might block
 */
export class DeepgramSimpleProcessor extends EventEmitter {
  private apiKey: string;
  private isProcessing: boolean = false;

  constructor() {
    super();
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️ DEEPGRAM_API_KEY not found - transcription disabled');
    } else {
      console.log('🎙️ Deepgram Simple Processor initialized');
    }
  }

  /**
   * Process audio buffer immediately
   */
  async processAudio(audioBuffer: Buffer, sampleRate: number = 48000): Promise<void> {
    if (!this.apiKey || this.isProcessing || audioBuffer.length < 1000) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const response = await axios.post(
        'https://api.deepgram.com/v1/listen',
        audioBuffer,
        {
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'audio/raw',
          },
          params: {
            encoding: 'linear16',
            sample_rate: sampleRate,
            channels: 1,
            punctuate: false,
            numerals: true,
            language: 'en-US',
          },
          timeout: 5000, // 5 second timeout
        }
      );

      const latency = Date.now() - startTime;
      const transcript = response.data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      const confidence = response.data.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

      if (transcript) {
        console.log('📝 Deepgram transcription:', transcript, `(${latency}ms)`);
        this.emit('transcription', {
          text: transcript,
          confidence,
          latency,
          timestamp: Date.now(),
        });
      }
    } catch (error: any) {
      if (error.code !== 'ECONNABORTED') { // Ignore timeout errors
        console.error('Deepgram API error:', error.message);
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

// Export singleton
export const deepgramSimpleProcessor = new DeepgramSimpleProcessor();