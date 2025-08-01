import { spawn } from 'child_process';
import { Readable, PassThrough } from 'stream';
import EventEmitter from 'events';

/**
 * Unified Audio Processor
 * 
 * Takes a single audio input and converts it to PCM16 format
 * for Deepgram transcription service.
 */
export class UnifiedAudioProcessor extends EventEmitter {
  private pcm16Stream: PassThrough;
  private ffmpegProcess: any;
  private isProcessing: boolean = false;
  private inputBuffer: Buffer[] = [];
  private processingStartTime: number = 0;

  constructor() {
    super();
    this.pcm16Stream = new PassThrough();
  }

  /**
   * Start processing audio from LiveKit format
   * LiveKit typically provides Opus-encoded audio
   */
  async startProcessing(sampleRate: number = 48000) {
    if (this.isProcessing) {
      console.log('⚠️ Audio processor already running');
      return;
    }

    // Check if FFmpeg is available
    try {
      const { execSync } = require('child_process');
      execSync('ffmpeg -version', { stdio: 'ignore' });
    } catch (error) {
      console.error('❌ FFmpeg not found. Please install FFmpeg to use the unified audio processor.');
      console.error('   On macOS: brew install ffmpeg');
      console.error('   On Ubuntu: sudo apt-get install ffmpeg');
      console.error('   Unified audio processor will not be available until FFmpeg is installed.');
      this.isProcessing = false;
      return; // Don't throw, just return
    }

    this.isProcessing = true;
    this.processingStartTime = Date.now();
    console.log('🎵 Starting unified audio processing for Deepgram');

    // Create FFmpeg process that outputs PCM16 for Deepgram
    this.ffmpegProcess = spawn('ffmpeg', [
      '-f', 's16le',           // Input format (we'll convert LiveKit audio to this first)
      '-ar', sampleRate.toString(),
      '-ac', '1',              // Mono audio
      '-i', 'pipe:0',          // Input from stdin
      
      // Output: PCM16 for Deepgram
      '-f', 's16le',
      '-ar', '16000',          // Deepgram prefers 16kHz
      '-ac', '1',
      'pipe:1'                 // Output to stdout
    ]);

    // Handle PCM16 output
    this.ffmpegProcess.stdout.on('data', (chunk: Buffer) => {
      this.emit('pcm16Data', {
        data: chunk,
        timestamp: Date.now(),
        processingTime: Date.now() - this.processingStartTime
      });
    });

    // Handle errors
    this.ffmpegProcess.stderr.on('data', (data: Buffer) => {
      const message = data.toString();
      if (!message.includes('size=') && !message.includes('time=')) {
        console.error('FFmpeg:', message);
      }
    });

    this.ffmpegProcess.on('error', (error: Error) => {
      console.error('❌ FFmpeg process error:', error);
      this.emit('error', error);
      this.cleanup();
    });

    this.ffmpegProcess.on('close', (code: number) => {
      console.log(`FFmpeg process closed with code ${code}`);
      this.isProcessing = false;
    });
  }

  /**
   * Process audio data from LiveKit
   * This should be called with the raw audio data from LiveKit tracks
   */
  processAudioData(audioData: Buffer) {
    if (!this.isProcessing || !this.ffmpegProcess) {
      console.error('❌ Audio processor not running');
      return;
    }

    try {
      // Write to FFmpeg stdin
      this.ffmpegProcess.stdin.write(audioData);
      
      // Track metrics
      this.emit('metrics', {
        inputBytes: audioData.length,
        timestamp: Date.now(),
        queueSize: this.inputBuffer.length
      });
    } catch (error) {
      console.error('Error processing audio data:', error);
      this.emit('error', error);
    }
  }

  /**
   * Convert LiveKit audio format to raw PCM
   * LiveKit audio comes as Opus/WebM typically
   */
  async convertLiveKitAudio(livekitAudio: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const convertProcess = spawn('ffmpeg', [
        '-f', 'webm',
        '-i', 'pipe:0',
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '1',
        'pipe:1'
      ]);

      const chunks: Buffer[] = [];
      
      convertProcess.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      convertProcess.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg conversion failed with code ${code}`));
        }
      });

      convertProcess.on('error', reject);
      convertProcess.stdin.write(livekitAudio);
      convertProcess.stdin.end();
    });
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('🧹 Cleaning up audio processor');
    
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.stdin.end();
        this.ffmpegProcess.kill('SIGTERM');
      } catch (error) {
        console.error('Error cleaning up FFmpeg:', error);
      }
      this.ffmpegProcess = null;
    }

    this.isProcessing = false;
    this.inputBuffer = [];
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      isProcessing: this.isProcessing,
      uptime: this.isProcessing ? Date.now() - this.processingStartTime : 0,
      bufferSize: this.inputBuffer.length
    };
  }
}

// Singleton instance
export const unifiedAudioProcessor = new UnifiedAudioProcessor();