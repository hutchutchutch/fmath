import WebSocket from 'ws';
import { roomManager } from './livekitRoomManagerFixed';
import { unifiedAudioProcessor } from './unifiedAudioProcessor';
import EventEmitter from 'events';

interface TranscriptionResult {
  service: 'deepgram';
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
  private currentRoomName: string = 'default';
  private currentParticipantId: string = 'user';
  private deepgramStreamStartTime: number = 0;
  private firstAudioChunkTime: number = 0;
  private isUnifiedProcessorAvailable: boolean = false;
  
  // Configuration
  private readonly BUFFER_CLEANUP_INTERVAL = 30000; // Clean old buffers every 30s

  constructor() {
    super();
    this.setupRoomManagerListeners();
    this.startBufferCleanup();
    this.setupAudioDataListener();
    this.setupUnifiedProcessor().catch(console.error);
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
   * Setup unified audio processor
   */
  private async setupUnifiedProcessor(): Promise<void> {
    // Listen for PCM16 data from unified processor
    unifiedAudioProcessor.on('pcm16Data', (data) => {
      if (this.isDeepgramConnected && this.deepgramSocket?.readyState === WebSocket.OPEN) {
        this.sendToDeepgram(data.data, this.currentRoomName, this.currentParticipantId, data.timestamp);
      }
    });


    // Start the processor
    try {
      await unifiedAudioProcessor.startProcessing(48000);
      // Check if it actually started
      if (unifiedAudioProcessor.getStats().isProcessing) {
        this.isUnifiedProcessorAvailable = true;
        console.log('✅ Unified audio processor started successfully');
      } else {
        this.isUnifiedProcessorAvailable = false;
        console.log('⚠️ Unified audio processor not available - falling back to direct processing');
      }
    } catch (error) {
      console.error('❌ Failed to initialize unified audio processor:', error);
      this.isUnifiedProcessorAvailable = false;
    }
  }

  /**
   * Setup direct audio data listener
   */
  private setupAudioDataListener(): void {
    // Listen for PCM16 audio data and send through unified processor
    this.on('audioData', (data) => {
      console.log('🎤 Audio data received for unified processing:', {
        roomName: data.roomName,
        participantId: data.participantId,
        dataSize: data.data?.length,
        timestamp: data.timestamp
      });
      
      // Update current context
      this.currentRoomName = data.roomName;
      this.currentParticipantId = data.participantId;
      
      // Send to unified processor which will convert and distribute to both services
      if (data.data && data.data.length > 0) {
        if (this.isUnifiedProcessorAvailable) {
          unifiedAudioProcessor.processAudioData(data.data);
        } else {
          // Fallback: Process directly without unified processor
          // Deepgram accepts PCM16 directly
          this.handleAudioData(data);
        }
      }
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
          
          // Enhanced debugging - log the full response first (limit size for readability)
          const responseStr = JSON.stringify(response, null, 2);
          if (responseStr.length > 500) {
            console.log('🔍 RAW Deepgram response (truncated):', responseStr.substring(0, 500) + '...');
          } else {
            console.log('🔍 RAW Deepgram response:', responseStr);
          }
          
          const isFinal = response.is_final || false;
          const transcript = response.channel?.alternatives?.[0]?.transcript || '';
          const confidence = response.channel?.alternatives?.[0]?.confidence || 0;
          
          console.log('📨 Deepgram message:', {
            type: response.type,
            isFinal,
            hasTranscript: !!transcript,
            transcript: transcript ? `"${transcript}"` : '<empty>',
            confidence: confidence,
            duration: response.duration,
            fullResponse: response
          });
          
          if (response.type === 'Results') {
            if (transcript && transcript.trim()) {
              // Calculate real latency from when we first received audio
              const now = Date.now();
              const latency = this.firstAudioChunkTime > 0 ? now - this.firstAudioChunkTime : 100;
              
              if (isFinal) {
                console.log('🎯 Deepgram FINAL transcription:', {
                  transcript: `"${transcript}"`,
                  confidence,
                  latency: `${latency}ms`,
                  participantId: this.currentParticipantId,
                  roomName: this.currentRoomName
                });
                
                console.log('🚀 About to call handleTranscription with:', {
                  service: 'deepgram',
                  text: transcript,
                  latency,
                  timestamp: now,
                  participantId: this.currentParticipantId,
                  roomName: this.currentRoomName,
                });
                
                this.handleTranscription({
                  service: 'deepgram',
                  text: transcript,
                  latency,
                  timestamp: now,
                  participantId: this.currentParticipantId,
                  roomName: this.currentRoomName,
                });
              } else {
                console.log('📝 Deepgram interim result:', {
                  transcript: `"${transcript}"`,
                  confidence,
                  isFinal: false
                });
              }
            } else {
              console.log('⚠️ Empty transcript in Results message:', {
                hasChannel: !!response.channel,
                hasAlternatives: !!response.channel?.alternatives,
                alternativesLength: response.channel?.alternatives?.length,
                transcript: transcript,
                isFinal
              });
            }
          } else if (response.type === 'Metadata') {
            console.log('📊 Deepgram metadata:', response);
          } else {
            console.log('❓ Unknown Deepgram message type:', response.type, response);
          }
        } catch (error) {
          console.error('❌ Error parsing Deepgram response:', error);
          console.error('Raw data:', data.toString());
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
   * Sanitize transcription to only include numbers
   */
  private sanitizeTranscription(text: string): string {
    console.log('🧼 sanitizeTranscription input:', `"${text}"`);
    
    // Remove all non-numerical content, keeping only number words and digits
    const numberWords = [
      'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
      'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 
      'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty',
      'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand',
      // Add sound-alikes to sanitization as well
      'to', 'too', 'tu', 'for', 'fore', 'ate', 'ait', 'none', 'non', 'nun',
      'won', 'wun', 'tree', 'free', 'oh', 'o'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    console.log('🔤 Split into words:', words);
    
    const filteredWords = words.filter(word => {
      // Keep if it's a number word
      if (numberWords.includes(word)) {
        console.log(`✅ Keeping number word: "${word}"`);
        return true;
      }
      // Keep if it's a digit
      if (/^\d+$/.test(word)) {
        console.log(`✅ Keeping digit: "${word}"`);
        return true;
      }
      // Keep compound numbers like "twenty-one"
      if (/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-\w+$/.test(word)) {
        console.log(`✅ Keeping compound: "${word}"`);
        return true;
      }
      console.log(`❌ Filtering out: "${word}"`);
      return false;
    });
    
    const result = filteredWords.join(' ');
    console.log('🧼 sanitizeTranscription output:', `"${result}"`);
    return result;
  }

  /**
   * Handle transcription result from any service
   */
  private handleTranscription(result: TranscriptionResult): void {
    console.log('🔥 handleTranscription called with:', result);
    
    // Sanitize the transcription to only include numbers
    const originalText = result.text;
    console.log('🧼 Before sanitization:', `"${originalText}"`);
    
    result.text = this.sanitizeTranscription(result.text);
    console.log('🧼 After sanitization:', `"${result.text}"`);
    
    // Extract number from transcription
    result.number = this.extractNumberFromText(result.text);
    console.log('🔢 Extracted number:', result.number);

    console.log(`📝 ${result.service.toUpperCase()} transcription processing:`, {
      originalText: `"${originalText}"`,
      sanitizedText: `"${result.text}"`,
      number: result.number,
      latency: `${result.latency}ms`,
      participant: result.participantId,
      roomName: result.roomName,
    });

    // Enhanced logging for event emission
    if (result.text.trim() || result.number !== null) {
      console.log('✅ EMITTING transcription event with data:', {
        service: result.service,
        text: result.text,
        number: result.number,
        latency: result.latency,
        timestamp: result.timestamp,
        participantId: result.participantId,
        roomName: result.roomName
      });
      
      console.log('👥 Event listeners for "transcription":', this.listenerCount('transcription'));
      
      this.emit('transcription', result);
      
      console.log('🎯 Transcription event emitted successfully');
    } else {
      console.log('❌ SKIPPING transcription - no numerical content found:', {
        textTrimmed: `"${result.text.trim()}"`,
        numberExtracted: result.number,
        hasTextContent: !!result.text.trim(),
        hasNumber: result.number !== null
      });
    }
  }

  /**
   * Extract number from text with sound-alike handling
   */
  private extractNumberFromText(text: string): number | null {
    console.log('🔢 extractNumberFromText input:', `"${text}"`);
    const cleanText = text.toLowerCase().trim();
    console.log('🔢 cleanText:', `"${cleanText}"`);
    
    // Direct number match
    const numberMatch = cleanText.match(/\b\d+\b/);
    if (numberMatch) {
      console.log('🔢 Found direct number match:', numberMatch[0]);
      const num = parseInt(numberMatch[0]);
      if (!isNaN(num) && num >= 0 && num <= 999) {
        console.log('🔢 Returning direct number:', num);
        return num;
      }
    }

    // Enhanced word to number conversion with sound-alikes
    const wordMap: { [key: string]: number } = {
      // Standard numbers
      'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
      'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
      'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
      'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
      'eighteen': 18, 'nineteen': 19, 'twenty': 20,
      'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
      'seventy': 70, 'eighty': 80, 'ninety': 90,
      
      // Sound-alikes and common misheard words
      'to': 2, 'too': 2, 'tu': 2,
      'for': 4, 'fore': 4, 'four': 4,
      'ate': 8, 'ait': 8,
      'none': 9, 'non': 9, 'nun': 9,
      'won': 1, 'wun': 1,
      'tree': 3, 'free': 3,
      'fife': 5, 'hive': 5,
      'sex': 6, 'sick': 6,
      'ate': 8, 'eight': 8,
      'tin': 10, 'teen': 10,
      
      // Additional variations
      'oh': 0, 'o': 0,
      'wan': 1,
      'too': 2, 'tue': 2,
      'tree': 3, 'tri': 3,
      'for': 4, 'fore': 4,
      'fiv': 5, 'fyve': 5,
      'sicks': 6, 'six': 6,
      'sevn': 7, 'sevin': 7,
      'ate': 8, 'eit': 8,
      'nein': 9, 'nin': 9,
      
      // Compound number parts
      'twenty': 20, 'twenny': 20, 'twentie': 20,
      'thirty': 30, 'therty': 30, 'thirtie': 30,
      'forty': 40, 'fourty': 40, 'fortie': 40,
      'fifty': 50, 'fiftie': 50, 'fifti': 50,
      'sixty': 60, 'sixtie': 60, 'sixti': 60,
      'seventy': 70, 'seventie': 70, 'seventi': 70,
      'eighty': 80, 'eightie': 80, 'eighti': 80,
      'ninety': 90, 'ninetie': 90, 'nineti': 90,
    };

    // Normalize text for fuzzy matching
    const normalizeText = (input: string): string => {
      return input
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim()
        .toLowerCase();
    };

    const normalized = normalizeText(cleanText);

    // Check for compound numbers like "twenty-one" or "twenty one"
    const compoundMatch = normalized.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|twenny|therty|fourty|fiftie|sixtie|seventie|eightie|ninetie)[- ]?(\w+)$/);
    if (compoundMatch) {
      const tensWord = compoundMatch[1];
      const onesWord = compoundMatch[2];
      
      const tens = wordMap[tensWord];
      const ones = wordMap[onesWord];
      
      if (tens !== undefined && ones !== undefined && ones < 10) {
        return tens + ones;
      }
    }

    // Check for exact matches first
    if (wordMap[normalized] !== undefined) {
      console.log('🔢 Found exact word match:', normalized, '->', wordMap[normalized]);
      return wordMap[normalized];
    }

    // Fuzzy matching for similar sounding words
    const words = normalized.split(' ');
    console.log('🔢 Checking words for matches:', words);
    
    for (const word of words) {
      if (wordMap[word] !== undefined) {
        console.log('🔢 Found word match:', word, '->', wordMap[word]);
        return wordMap[word];
      }
      
      // Additional fuzzy matching
      for (const [key, value] of Object.entries(wordMap)) {
        // Check if words sound similar (simple Levenshtein-like check)
        if (this.soundsLike(word, key)) {
          console.log(`🔍 Sound-alike match: "${word}" -> "${key}" (${value})`);
          return value;
        }
      }
    }

    console.log('🔢 No number found, returning null');
    return null;
  }

  /**
   * Simple sound-alike matching for common speech recognition errors
   */
  private soundsLike(word1: string, word2: string): boolean {
    if (word1 === word2) return true;
    if (Math.abs(word1.length - word2.length) > 2) return false;
    
    // Common sound-alike patterns
    const patterns = [
      // 'none' sounds like 'nine'
      [/^none?$/, /^nin?e?$/],
      [/^non$/, /^nin?e?$/],
      [/^nun$/, /^nin?e?$/],
      
      // 'to/too' sounds like 'two'
      [/^to{1,2}$/, /^tw?o$/],
      [/^tu$/, /^tw?o$/],
      
      // 'for/fore' sounds like 'four'
      [/^for?e?$/, /^fou?r$/],
      
      // 'ate' sounds like 'eight'
      [/^ate?$/, /^eigh?t$/],
      [/^ait$/, /^eigh?t$/],
      
      // 'won' sounds like 'one'
      [/^won$/, /^on?e$/],
      [/^wun$/, /^on?e$/],
      
      // 'tree/free' sounds like 'three'
      [/^t?ree$/, /^th?ree$/],
      [/^free$/, /^th?ree$/],
    ];
    
    for (const [pattern1, pattern2] of patterns) {
      if ((pattern1.test(word1) && pattern2.test(word2)) || 
          (pattern2.test(word1) && pattern1.test(word2))) {
        return true;
      }
    }
    
    return false;
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
    activeParticipants: number;
  } {
    return {
      deepgram: this.isDeepgramConnected,
      activeParticipants: this.audioBuffers.size,
    };
  }
}

// Export singleton instance
export const audioRouter = new AudioRouter();