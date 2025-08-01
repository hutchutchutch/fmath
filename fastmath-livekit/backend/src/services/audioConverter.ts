import { spawn } from 'child_process';
import { Readable } from 'stream';

export class AudioConverter {
  /**
   * Convert audio buffer from one format to another using FFmpeg
   * @param inputBuffer - Input audio buffer
   * @param inputFormat - Input format (e.g., 'opus', 'webm')
   * @param outputFormat - Output format (e.g., 'wav', 'mp3')
   * @param sampleRate - Sample rate (default: 16000 for speech)
   * @returns Converted audio buffer
   */
  static async convertAudio(
    inputBuffer: Buffer,
    inputFormat: string,
    outputFormat: string,
    sampleRate: number = 16000
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      
      // FFmpeg command for audio conversion
      const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',              // Input from stdin
        '-f', inputFormat,           // Input format
        '-ar', sampleRate.toString(), // Sample rate
        '-ac', '1',                  // Mono audio
        '-f', outputFormat,          // Output format
        '-loglevel', 'error',        // Only show errors
        'pipe:1'                     // Output to stdout
      ]);

      // Collect output chunks
      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      // Handle errors
      ffmpeg.stderr.on('data', (data) => {
        console.error('FFmpeg error:', data.toString());
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg process error: ${error.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      // Write input buffer to FFmpeg
      ffmpeg.stdin.write(inputBuffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Convert Opus audio (from LiveKit) to WAV format (for Groq/Whisper)
   * @param opusBuffer - Opus audio buffer
   * @returns WAV audio buffer
   */
  static async opusToWav(opusBuffer: Buffer): Promise<Buffer> {
    try {
      return await this.convertAudio(opusBuffer, 'opus', 'wav', 16000);
    } catch (error) {
      console.error('Error converting Opus to WAV:', error);
      throw error;
    }
  }

  /**
   * Convert WebM audio to WAV format
   * @param webmBuffer - WebM audio buffer
   * @returns WAV audio buffer
   */
  static async webmToWav(webmBuffer: Buffer): Promise<Buffer> {
    try {
      return await this.convertAudio(webmBuffer, 'webm', 'wav', 16000);
    } catch (error) {
      console.error('Error converting WebM to WAV:', error);
      throw error;
    }
  }

  /**
   * Convert a stream of audio chunks
   * @param inputStream - Stream of audio chunks
   * @param inputFormat - Input format
   * @param outputFormat - Output format
   * @returns Stream of converted audio chunks
   */
  static createConversionStream(
    inputFormat: string,
    outputFormat: string,
    sampleRate: number = 16000
  ): {
    input: Readable;
    output: Readable;
    process: any;
  } {
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-f', inputFormat,
      '-ar', sampleRate.toString(),
      '-ac', '1',
      '-f', outputFormat,
      '-loglevel', 'error',
      'pipe:1'
    ]);

    return {
      input: ffmpeg.stdin as any,
      output: ffmpeg.stdout,
      process: ffmpeg
    };
  }

  /**
   * Check if FFmpeg is available
   */
  static async checkFFmpeg(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version']);
      
      ffmpeg.on('error', () => {
        console.error('❌ FFmpeg not found. Please install FFmpeg for audio conversion.');
        resolve(false);
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('✅ FFmpeg is available');
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }
}

// Simple in-memory audio format detection
export function detectAudioFormat(buffer: Buffer): string {
  // Check for common audio format signatures
  const signature = buffer.toString('hex', 0, 16);
  
  // WebM signature
  if (signature.startsWith('1a45dfa3')) {
    return 'webm';
  }
  
  // WAV signature
  if (signature.startsWith('52494646') && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return 'wav';
  }
  
  // Opus signature (OggS)
  if (signature.startsWith('4f676753')) {
    return 'opus';
  }
  
  // MP3 signatures
  if (signature.startsWith('494433') || signature.startsWith('fffb')) {
    return 'mp3';
  }
  
  // Default to WebM for LiveKit audio
  return 'webm';
}

/**
 * Prepare audio buffer for Groq API
 * Groq expects WAV or MP3 format
 */
export async function prepareAudioForGroq(
  audioBuffer: Buffer,
  sourceFormat?: string
): Promise<Buffer> {
  // Detect format if not provided
  const format = sourceFormat || detectAudioFormat(audioBuffer);
  
  console.log(`Detected audio format: ${format}`);
  
  // If already in supported format, return as-is
  if (format === 'wav' || format === 'mp3') {
    return audioBuffer;
  }
  
  // Check if FFmpeg is available
  const ffmpegAvailable = await AudioConverter.checkFFmpeg();
  if (!ffmpegAvailable) {
    throw new Error('FFmpeg is required for audio conversion but not found');
  }
  
  // Convert to WAV
  console.log(`Converting ${format} to WAV for Groq...`);
  
  switch (format) {
    case 'opus':
      return await AudioConverter.opusToWav(audioBuffer);
    case 'webm':
      return await AudioConverter.webmToWav(audioBuffer);
    default:
      return await AudioConverter.convertAudio(audioBuffer, format, 'wav');
  }
}