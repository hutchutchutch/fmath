import EventEmitter from 'events';

/**
 * Simple event emitter for transcription results
 * Used to communicate between LiveKit handler and SSE endpoint
 */
class TranscriptionEmitter extends EventEmitter {
  constructor() {
    super();
    console.log('📢 Transcription Emitter initialized');
  }

  emitTranscription(data: any): void {
    console.log('📤 Emitting transcription:', data);
    this.emit('transcription', data);
  }
}

// Export singleton instance
export const transcriptionEmitter = new TranscriptionEmitter();