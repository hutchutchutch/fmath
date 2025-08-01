/**
 * Simplified Audio Format Handler for Browser-based LiveKit
 * 
 * Since LiveKit from browsers sends Opus-in-WebM format, and both
 * Deepgram and Groq support WebM directly, we don't need FFmpeg
 * for conversion. This module provides format detection and 
 * validation without external dependencies.
 */

/**
 * Detect audio format from buffer header
 */
export function detectAudioFormat(buffer: Buffer): string {
  if (buffer.length < 16) {
    return 'unknown';
  }

  const signature = buffer.toString('hex', 0, 16);
  
  // WebM signature (most common from browsers)
  if (signature.startsWith('1a45dfa3')) {
    return 'webm';
  }
  
  // Opus signature (OggS) - less common
  if (signature.startsWith('4f676753')) {
    return 'opus';
  }
  
  // WAV signature (not expected from LiveKit)
  if (signature.startsWith('52494646') && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return 'wav';
  }
  
  return 'webm'; // Default assumption for LiveKit
}

/**
 * Validate that audio buffer is in expected format
 */
export function validateAudioBuffer(buffer: Buffer): {
  valid: boolean;
  format: string;
  error?: string;
} {
  if (!buffer || buffer.length === 0) {
    return {
      valid: false,
      format: 'unknown',
      error: 'Empty audio buffer'
    };
  }

  if (buffer.length < 100) {
    return {
      valid: false,
      format: 'unknown',
      error: 'Audio buffer too small'
    };
  }

  const format = detectAudioFormat(buffer);
  
  // Both WebM and Opus are valid for our use case
  if (format === 'webm' || format === 'opus') {
    return {
      valid: true,
      format
    };
  }

  return {
    valid: false,
    format,
    error: `Unexpected audio format: ${format}`
  };
}

/**
 * Prepare audio metadata for service APIs
 */
export function getAudioMetadata(buffer: Buffer): {
  mimeType: string;
  filename: string;
  format: string;
} {
  const format = detectAudioFormat(buffer);
  
  switch (format) {
    case 'webm':
      return {
        mimeType: 'audio/webm;codecs=opus',
        filename: 'audio.webm',
        format: 'webm'
      };
    
    case 'opus':
      return {
        mimeType: 'audio/ogg;codecs=opus',
        filename: 'audio.ogg',
        format: 'opus'
      };
    
    default:
      // Default to WebM as it's most common
      return {
        mimeType: 'audio/webm',
        filename: 'audio.webm',
        format: 'webm'
      };
  }
}

/**
 * Create a File object for API submission
 */
export function createAudioFile(buffer: Buffer): File {
  const metadata = getAudioMetadata(buffer);
  
  return new File([buffer], metadata.filename, {
    type: metadata.mimeType,
  });
}

/**
 * Log audio buffer info for debugging
 */
export function logAudioBufferInfo(buffer: Buffer, label: string = 'Audio'): void {
  const validation = validateAudioBuffer(buffer);
  const metadata = getAudioMetadata(buffer);
  
  console.log(`${label} Buffer Info:`, {
    size: `${(buffer.length / 1024).toFixed(2)} KB`,
    format: validation.format,
    valid: validation.valid,
    mimeType: metadata.mimeType,
    error: validation.error
  });
}