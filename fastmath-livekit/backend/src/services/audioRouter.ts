import WebSocket from 'ws';
import { groqService } from './groqService';
import { roomManager } from './livekitRoomManagerFixed';
import EventEmitter from 'events';

interface TranscriptionResult {
  service: 'deepgram' | 'groq';
  text: string;
  latency: number;
  timestamp: number;
  participantId: string;
  roomName: string;
  number?: number | null;
}

interface AudioBuffer {
  data: Buffer;
  timestamp: number;
  processed: boolean;
}

export class AudioRouter extends EventEmitter {
  private deepgramSocket?: WebSocket;
  private isDeepgramConnected: boolean = false;
  private audioBuffers: Map<string, AudioBuffer[]> = new Map();
  private processingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private deepgramBytesSent: number = 0;
  private groqChunksProcessed: number = 0;
  private currentRoomName: string = 'default';
  private currentParticipantId: string = 'user';
  private deepgramStreamStartTime: number = 0;
  private firstAudioChunkTime: number = 0;
  
  // Configuration
  private readonly GROQ_CHUNK_DURATION = 3000; // 3 seconds for Groq chunks
  private readonly BUFFER_CLEANUP_INTERVAL = 30000; // Clean old buffers every 30s

  constructor() {
    super();
    this.setupRoomManagerListeners();
    this.startBufferCleanup();
    this.setupAudioDataListener();
    console.log('🔀 Audio Router initialized');
  }

  /**
   * Setup listeners for room manager audio events
   */
  private setupRoomManagerListeners(): void {
    roomManager.on('audioData', (data) => {
      this.handleAudioData(data);
    });

    roomManager.on('participantLeft', ({ roomName, participant }) => {
      this.cleanupParticipant(`${roomName}-${participant}`);
    });

    roomManager.on('roomDisconnected', ({ roomName }) => {
      this.cleanupRoom(roomName);
    });
  }

  /**
   * Setup direct audio data listener
   */
  private setupAudioDataListener(): void {
    // Listen for PCM16 audio data (for Deepgram)
    this.on('audioData', (data) => {
      console.log('🎤 PCM16 audio data received:', {
        roomName: data.roomName,
        participantId: data.participantId,
        dataSize: data.data?.length,
        timestamp: data.timestamp
      });
      this.handleAudioData(data);
    });
    
    // Listen for WebM audio data (for Groq)
    this.on('webmAudioData', (data) => {
      console.log('📹 WebM audio data received for Groq:', {
        roomName: data.roomName,
        participantId: data.participantId,
        dataSize: data.data?.length,
        timestamp: data.timestamp
      });
      this.handleWebMAudioData(data);
    });
    
    // Listen for speech timer reset (silence detected)
    this.on('resetSpeechTimer', () => {
      console.log('🔄 Resetting speech timer due to silence');
      this.firstAudioChunkTime = 0;
    });
  }

  /**
   * Handle incoming PCM16 audio data (for Deepgram)
   */
  private handleAudioData(data: any): void {
    const { roomName, participantId, data: audioBuffer, timestamp } = data;
    const key = `${roomName}-${participantId}`;

    // Update current room and participant
    this.currentRoomName = roomName;
    this.currentParticipantId = participantId;

    // Track first audio chunk time for latency calculation
    if (this.firstAudioChunkTime === 0 || timestamp < this.firstAudioChunkTime) {
      this.firstAudioChunkTime = timestamp;
      console.log('🎯 First audio chunk received at:', this.firstAudioChunkTime);
    }

    // Log audio data receipt (only first few times)
    if (!this.audioBuffers.has(key) || this.audioBuffers.get(key)!.length < 5) {
      console.log('🎵 Handling PCM16 audio data for Deepgram:', {
        roomName,
        participantId,
        bufferSize: audioBuffer?.length,
        deepgramConnected: this.isDeepgramConnected,
        deepgramReady: this.deepgramSocket?.readyState === WebSocket.OPEN
      });
    }

    // Route to Deepgram (real-time streaming)
    if (this.isDeepgramConnected && this.deepgramSocket?.readyState === WebSocket.OPEN) {
      this.sendToDeepgram(audioBuffer, roomName, participantId, timestamp);
    } else {
      if (!this.audioBuffers.has(key) || this.audioBuffers.get(key)!.length < 2) {
        console.log('⚠️ Deepgram not ready:', {
          connected: this.isDeepgramConnected,
          socketState: this.deepgramSocket?.readyState,
          socketStates: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 },
          currentState: this.deepgramSocket?.readyState
        });
      }
    }
  }

  /**
   * Connect to Deepgram WebSocket
   */
  async connectDeepgram(apiKey: string): Promise<void> {
    if (this.isDeepgramConnected) {
      console.log('Already connected to Deepgram');
      return;
    }

    try {
      // Deepgram WebSocket URL with correct parameters
      const url = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&punctuate=false&numerals=true&interim_results=true`;
      
      this.deepgramSocket = new WebSocket(url, {
        headers: {
          Authorization: `Token ${apiKey}`,
        },
      });

      this.deepgramSocket.on('open', () => {
        console.log('✅ Connected to Deepgram WebSocket');
        this.isDeepgramConnected = true;
        this.emit('deepgramConnected');
      });

      this.deepgramSocket.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          
          // Log all Deepgram messages for debugging
          const isFinal = response.is_final || false;
          const transcript = response.channel?.alternatives?.[0]?.transcript || '';
          
          console.log('📨 Deepgram message:', {
            type: response.type,
            isFinal,
            hasTranscript: !!transcript,
            transcript: transcript.substring(0, 50),
            duration: response.duration
          });
          
          if (response.type === 'Results' && transcript) {
            // Calculate real latency from when we first received audio
            const now = Date.now();
            const latency = this.firstAudioChunkTime > 0 ? now - this.firstAudioChunkTime : 100;
            
            // Only process final results to avoid duplicate transcriptions
            if (isFinal && transcript.trim()) {
              console.log('🎯 Deepgram FINAL transcription:', transcript);
              console.log('⏱️ Deepgram latency:', {
                now,
                firstAudioChunk: this.firstAudioChunkTime,
                latency: `${latency}ms`,
                duration: response.duration ? `${response.duration}s` : 'N/A'
              });
              this.handleTranscription({
                service: 'deepgram',
                text: transcript,
                latency,
                timestamp: now,
                participantId: this.currentParticipantId,
                roomName: this.currentRoomName,
              });
            } else if (!isFinal) {
              console.log('📝 Deepgram interim result:', transcript.substring(0, 50));
            }
          }
        } catch (error) {
          console.error('Error parsing Deepgram response:', error);
        }
      });

      this.deepgramSocket.on('error', (error) => {
        console.error('❌ Deepgram WebSocket error:', error);
        this.emit('deepgramError', error);
      });

      this.deepgramSocket.on('close', () => {
        console.log('🔌 Deepgram WebSocket closed');
        this.isDeepgramConnected = false;
        this.emit('deepgramDisconnected');
        
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          if (apiKey) {
            this.connectDeepgram(apiKey).catch(console.error);
          }
        }, 5000);
      });

    } catch (error) {
      console.error('Failed to connect to Deepgram:', error);
      throw error;
    }
  }

  /**
   * Send audio to Deepgram
   */
  private sendToDeepgram(audioBuffer: Buffer, roomName: string, participantId: string, timestamp: number): void {
    if (!this.deepgramSocket || this.deepgramSocket.readyState !== WebSocket.OPEN) {
      console.log('⚠️ Cannot send to Deepgram - socket not open');
      return;
    }

    try {
      // Send raw audio buffer to Deepgram
      this.deepgramSocket.send(audioBuffer);
      this.deepgramBytesSent += audioBuffer.length;
      
      // Log progress every 100KB
      if (this.deepgramBytesSent > 0 && this.deepgramBytesSent % 102400 < audioBuffer.length) {
        console.log(`📊 Deepgram: Sent ${(this.deepgramBytesSent / 1024).toFixed(2)} KB total`);
      }
      
      // Store metadata for result correlation
      // In production, you'd want a more sophisticated correlation mechanism
      this.emit('audioSentToDeepgram', { roomName, participantId, timestamp });
    } catch (error) {
      console.error('Error sending audio to Deepgram:', error);
    }
  }

  /**
   * Handle WebM audio data specifically for Groq
   */
  private handleWebMAudioData(data: any): void {
    const { roomName, participantId, data: webmBuffer, timestamp } = data;
    
    // Update current room and participant
    this.currentRoomName = roomName;
    this.currentParticipantId = participantId;
    
    if (!webmBuffer || webmBuffer.length === 0) {
      console.log('⚠️ Empty WebM buffer received');
      return;
    }
    
    // Process WebM audio with Groq immediately
    if (groqService.isAvailable()) {
      this.groqChunksProcessed++;
      console.log(`🎯 Processing WebM chunk #${this.groqChunksProcessed} with Groq, size: ${webmBuffer.length} bytes`);
      groqService.transcribeAudio(webmBuffer)
        .then((result) => {
          console.log('🔊 Groq WebM result:', {
            chunkNumber: this.groqChunksProcessed,
            text: result.text,
            error: result.error,
            latency: result.latency
          });
          
          if (result.text && !result.error) {
            this.handleTranscription({
              service: 'groq',
              text: result.text,
              latency: result.latency,
              timestamp: Date.now(),
              participantId,
              roomName,
            });
          }
        })
        .catch((error) => {
          console.error('Error processing Groq WebM transcription:', error);
        });
    } else {
      console.log('⚠️ Groq service not available for WebM processing');
    }
  }

  /**
   * Buffer audio for Groq processing
   */
  private bufferForGroq(key: string, audioBuffer: Buffer, timestamp: number, roomName: string, participantId: string): void {
    // Initialize buffer array if needed
    if (!this.audioBuffers.has(key)) {
      this.audioBuffers.set(key, []);
      this.startGroqProcessing(key, roomName, participantId);
    }

    // Add to buffer
    const buffers = this.audioBuffers.get(key)!;
    buffers.push({ data: audioBuffer, timestamp, processed: false });
  }

  /**
   * Start Groq processing interval for a participant
   */
  private startGroqProcessing(key: string, roomName: string, participantId: string): void {
    const interval = setInterval(async () => {
      const buffers = this.audioBuffers.get(key);
      if (!buffers || buffers.length === 0) return;

      // Get unprocessed buffers from the last chunk duration
      const now = Date.now();
      const chunkStart = now - this.GROQ_CHUNK_DURATION;
      
      const unprocessedBuffers = buffers.filter(b => 
        !b.processed && b.timestamp >= chunkStart
      );

      if (unprocessedBuffers.length === 0) return;

      // Mark buffers as processed
      unprocessedBuffers.forEach(b => b.processed = true);

      // Combine audio buffers
      const combinedBuffer = Buffer.concat(unprocessedBuffers.map(b => b.data));

      // Send to Groq for transcription
      if (groqService.isAvailable()) {
        console.log(`🎯 Sending ${combinedBuffer.length} bytes to Groq for transcription`);
        try {
          const startTime = Date.now();
          const result = await groqService.transcribeAudio(combinedBuffer);
          
          console.log('🔊 Groq result:', {
            text: result.text,
            error: result.error,
            latency: result.latency
          });
          
          if (result.text && !result.error) {
            this.handleTranscription({
              service: 'groq',
              text: result.text,
              latency: result.latency,
              timestamp: Date.now(),
              participantId,
              roomName,
            });
          }
        } catch (error) {
          console.error('Error processing Groq transcription:', error);
        }
      } else {
        console.log('⚠️ Groq service not available');
      }
    }, this.GROQ_CHUNK_DURATION);

    this.processingIntervals.set(key, interval);
  }

  /**
   * Sanitize transcription to only include numbers
   */
  private sanitizeTranscription(text: string): string {
    // Remove all non-numerical content, keeping only number words and digits
    const numberWords = [
      'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
      'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 
      'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty',
      'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    const filteredWords = words.filter(word => {
      // Keep if it's a number word
      if (numberWords.includes(word)) return true;
      // Keep if it's a digit
      if (/^\d+$/.test(word)) return true;
      // Keep compound numbers like "twenty-one"
      if (/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-\w+$/.test(word)) return true;
      return false;
    });
    
    return filteredWords.join(' ');
  }

  /**
   * Handle transcription result from any service
   */
  private handleTranscription(result: TranscriptionResult): void {
    // Sanitize the transcription to only include numbers
    const originalText = result.text;
    result.text = this.sanitizeTranscription(result.text);
    
    // Extract number from transcription
    if (result.service === 'deepgram') {
      result.number = this.extractNumberFromText(result.text);
    } else if (result.service === 'groq') {
      result.number = groqService.extractNumberFromTranscription(result.text);
    }

    console.log(`📝 ${result.service.toUpperCase()} transcription:`, {
      originalText,
      sanitizedText: result.text,
      number: result.number,
      latency: `${result.latency}ms`,
      participant: result.participantId,
      roomName: result.roomName,
    });

    // Only emit if we have meaningful content
    if (result.text.trim() || result.number !== null) {
      console.log('🚀 Emitting transcription event');
      this.emit('transcription', result);
    } else {
      console.log('⚠️ Skipping transcription - no numerical content found');
    }
  }

  /**
   * Extract number from text (for Deepgram)
   */
  private extractNumberFromText(text: string): number | null {
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
    const wordMap: { [key: string]: number } = {
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
      const tens = wordMap[compoundMatch[1]];
      const ones = wordMap[compoundMatch[2]];
      if (tens !== undefined && ones !== undefined && ones < 10) {
        return tens + ones;
      }
    }

    // Check for single words
    for (const [word, num] of Object.entries(wordMap)) {
      if (cleanText === word) {
        return num;
      }
    }

    return null;
  }

  /**
   * Clean up buffers periodically
   */
  private startBufferCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 60000; // Keep buffers for 1 minute max

      this.audioBuffers.forEach((buffers, key) => {
        // Remove old processed buffers
        const filtered = buffers.filter(b => 
          !b.processed || (now - b.timestamp) < maxAge
        );
        
        if (filtered.length === 0) {
          this.audioBuffers.delete(key);
          const interval = this.processingIntervals.get(key);
          if (interval) {
            clearInterval(interval);
            this.processingIntervals.delete(key);
          }
        } else {
          this.audioBuffers.set(key, filtered);
        }
      });
    }, this.BUFFER_CLEANUP_INTERVAL);
  }

  /**
   * Clean up participant data
   */
  private cleanupParticipant(key: string): void {
    // Clear buffers
    this.audioBuffers.delete(key);
    
    // Clear processing interval
    const interval = this.processingIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.processingIntervals.delete(key);
    }
    
    console.log(`🧹 Cleaned up participant: ${key}`);
  }

  /**
   * Clean up room data
   */
  private cleanupRoom(roomName: string): void {
    // Clean up all participants in room
    this.audioBuffers.forEach((_, key) => {
      if (key.startsWith(roomName)) {
        this.cleanupParticipant(key);
      }
    });
    
    console.log(`🧹 Cleaned up room: ${roomName}`);
  }

  /**
   * Disconnect all services
   */
  async disconnect(): Promise<void> {
    // Close Deepgram connection
    if (this.deepgramSocket) {
      this.deepgramSocket.close();
      this.deepgramSocket = undefined;
    }

    // Clear all intervals
    this.processingIntervals.forEach(interval => clearInterval(interval));
    this.processingIntervals.clear();

    // Clear buffers
    this.audioBuffers.clear();

    console.log('🔌 Audio router disconnected');
  }

  /**
   * Get service status
   */
  getStatus(): {
    deepgram: boolean;
    groq: boolean;
    activeParticipants: number;
  } {
    return {
      deepgram: this.isDeepgramConnected,
      groq: groqService.isAvailable(),
      activeParticipants: this.audioBuffers.size,
    };
  }
}

// Export singleton instance
export const audioRouter = new AudioRouter();