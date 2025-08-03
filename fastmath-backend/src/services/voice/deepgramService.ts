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
    console.log('🌊 [Backend/Deepgram] Starting transcription service...');
    try {
      // Default configuration optimized for low latency
      const transcriptionConfig = {
        model: config.model || 'nova',
        language: config.language || 'en-US',
        encoding: config.encoding || 'linear16',
        sample_rate: config.sampleRate || 48000,
        channels: config.channels || 1,
        interim_results: config.interimResults !== false, // Default to true
        endpointing: 300, // Reduce endpointing to 300ms for faster results
        vad_events: true, // Enable voice activity detection events
        utterance_end_ms: 1000, // End utterance after 1 second of silence
      };

      console.log('📝 [Backend/Deepgram] Starting transcription with config:', transcriptionConfig);
      
      this.connection = this.deepgram.listen.live(transcriptionConfig);

      // Set up event handlers
      if (this.connection) {
        this.connection.on(LiveTranscriptionEvents.Open, () => {
          console.log('✅ [Backend/Deepgram] Connection opened');
          this.emit('open');
          
          // Start keep-alive to prevent connection delays
          this.startKeepAlive();
          console.log('🕓 [Backend/Deepgram] Keep-alive started');
        });

        this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
          const transcript = data.channel?.alternatives?.[0];
          if (transcript && transcript.transcript && transcript.transcript.trim()) {
            // Log the full data structure to debug
            console.log(`🔍 [Backend/Deepgram] Full transcript data:`, {
              is_final: data.is_final,
              speech_final: data.speech_final,
              type: data.type,
              duration: data.duration,
              start: data.start
            });
            
            const transcriptionData = {
              text: transcript.transcript,
              isFinal: data.is_final || false,
              speechFinal: data.speech_final || false, // Deepgram's endpointing signal
              confidence: transcript.confidence || 0,
              timestamp: Date.now()
            };
            
            // Emit both 'transcription' event and specific events for interim/final
            this.emit('transcription', transcriptionData);
            
            if (data.is_final) {
              console.log(`📝 [Backend/Deepgram] Final: "${transcript.transcript}" (confidence: ${transcriptionData.confidence}, speech_final: ${data.speech_final})`);
            } else {
              console.log(`⚡ [Backend/Deepgram] Interim: "${transcript.transcript}" (confidence: ${transcriptionData.confidence})`);
              // Also emit interim event for compatibility
              this.emit('interim', transcript.transcript);
            }
          }
        });

        this.connection.on(LiveTranscriptionEvents.Close, () => {
          console.log('🔌 [Backend/Deepgram] Connection closed');
          this.emit('close');
          this.stopKeepAlive();
        });

        this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
          console.error('❌ [Backend/Deepgram] Error:', error);
          console.error('[Backend/Deepgram] Error details:', {
            message: error.message,
            code: error.code,
            type: error.type
          });
          this.emit('error', error);
        });
      }

    } catch (error) {
      console.error('❌ [Backend/Deepgram] Failed to start transcription:', error);
      throw error;
    }
  }

  sendAudio(audioData: Buffer): void {
    if (this.connection && this.connection.getReadyState() === 1) {
      this.connection.send(audioData);
    } else {
      const state = this.connection?.getReadyState();
      console.warn(`⚠️ [Backend/Deepgram] Connection not ready (state: ${state}), skipping ${audioData.length} bytes`);
    }
  }

  stop(): void {
    console.log('🚫 [Backend/Deepgram] Stopping transcription');
    this.stopKeepAlive();
    
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
      console.log('✅ [Backend/Deepgram] Connection closed and cleaned up');
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