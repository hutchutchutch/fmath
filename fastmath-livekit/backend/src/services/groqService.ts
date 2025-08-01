import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { createAudioFile, validateAudioBuffer, logAudioBufferInfo } from './audioConverterSimple';

dotenv.config();

export class GroqService {
  private groq?: Groq;
  private isInitialized: boolean = false;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
      console.error('❌ GROQ_API_KEY not found in environment variables');
      return;
    }

    try {
      this.groq = new Groq({
        apiKey: apiKey,
      });
      this.isInitialized = true;
      console.log('✅ Groq service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Groq service:', error);
    }
  }

  /**
   * Transcribe audio using Groq's Whisper model
   * @param audioBuffer - Audio data as Buffer
   * @param options - Transcription options
   * @returns Transcription result
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    options: {
      model?: string;
      language?: string;
      temperature?: number;
      prompt?: string;
    } = {}
  ): Promise<{
    text: string;
    latency: number;
    error?: string;
  }> {
    if (!this.isInitialized) {
      return {
        text: '',
        latency: 0,
        error: 'Groq service not initialized',
      };
    }

    const startTime = Date.now();

    // Validate audio buffer
    const validation = validateAudioBuffer(audioBuffer);
    if (!validation.valid) {
      return {
        text: '',
        latency: 0,
        error: validation.error || 'Invalid audio buffer',
      };
    }

    // Log buffer info for debugging
    logAudioBufferInfo(audioBuffer, 'Groq transcription');

    try {
      // Create File object with proper mime type
      const audioFile = createAudioFile(audioBuffer);

      // Use a simpler prompt to guide Whisper to focus on numbers
      const numberPrompt = options.prompt || 'Transcribe numbers only.';
      
      const transcription = await this.groq!.audio.transcriptions.create({
        file: audioFile,
        model: options.model || 'whisper-large-v3',
        language: options.language || 'en',
        temperature: options.temperature || 0,
        response_format: 'json',
        prompt: numberPrompt,
      });

      const latency = Date.now() - startTime;

      console.log(`✅ Groq transcription completed in ${latency}ms`);
      console.log(`Transcript: "${transcription.text}"`);

      return {
        text: transcription.text,
        latency,
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      console.error('❌ Groq transcription error:', error);
      
      return {
        text: '',
        latency,
        error: error.message || 'Transcription failed',
      };
    }
  }

  /**
   * Process audio stream in chunks
   * @param audioStream - Continuous audio stream
   * @param onTranscription - Callback for each transcription
   */
  async processAudioStream(
    audioStream: AsyncIterable<Buffer>,
    onTranscription: (result: { text: string; latency: number; timestamp: number }) => void
  ) {
    const CHUNK_DURATION_MS = 3000; // 3 seconds chunks
    const MIN_CHUNK_SIZE = 16000; // Minimum bytes for a valid audio chunk
    
    let audioBuffer = Buffer.alloc(0);
    let lastProcessTime = Date.now();

    for await (const chunk of audioStream) {
      audioBuffer = Buffer.concat([audioBuffer, chunk]);

      // Process chunk if we have enough data and time has passed
      if (
        audioBuffer.length >= MIN_CHUNK_SIZE &&
        Date.now() - lastProcessTime >= CHUNK_DURATION_MS
      ) {
        const chunkToProcess = audioBuffer;
        audioBuffer = Buffer.alloc(0); // Reset buffer
        lastProcessTime = Date.now();

        // Process in background
        this.transcribeAudio(chunkToProcess)
          .then((result) => {
            if (result.text && !result.error) {
              onTranscription({
                text: result.text,
                latency: result.latency,
                timestamp: Date.now(),
              });
            }
          })
          .catch((error) => {
            console.error('Error processing audio chunk:', error);
          });
      }
    }

    // Process any remaining audio
    if (audioBuffer.length > 0) {
      const result = await this.transcribeAudio(audioBuffer);
      if (result.text && !result.error) {
        onTranscription({
          text: result.text,
          latency: result.latency,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Extract number from transcribed text
   * Similar to the logic used for Web Speech API
   */
  extractNumberFromTranscription(text: string): number | null {
    const cleanText = text.toLowerCase().trim();
    
    // Direct number match
    const numberMatch = cleanText.match(/\b\d+\b/);
    if (numberMatch) {
      const num = parseInt(numberMatch[0]);
      if (!isNaN(num) && num >= 0 && num <= 999) {
        return num;
      }
    }

    // Extended word to number conversion
    const wordToNumber: { [key: string]: number } = {
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
      'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
      'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
      'eighteen': 18, 'nineteen': 19, 'twenty': 20,
      'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
      'seventy': 70, 'eighty': 80, 'ninety': 90,
    };

    // Check for compound numbers like "twenty-one"
    const compoundMatch = cleanText.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](\w+)$/);
    if (compoundMatch) {
      const tens = wordToNumber[compoundMatch[1]];
      const ones = wordToNumber[compoundMatch[2]];
      if (tens !== undefined && ones !== undefined && ones < 10) {
        return tens + ones;
      }
    }

    // Check for single words
    for (const [word, num] of Object.entries(wordToNumber)) {
      if (cleanText === word) {
        return num;
      }
    }

    return null;
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const groqService = new GroqService();