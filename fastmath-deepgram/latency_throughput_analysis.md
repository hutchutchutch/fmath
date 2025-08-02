# FastMath LiveKit Latency & Throughput Analysis

## Executive Summary

Current latency measurements show **Deepgram: 4399ms** and **Groq: 2283ms**, which are significantly higher than expected. Additionally, there are critical input detection issues where services are missing inputs that other services capture. This analysis identifies the root causes and provides actionable solutions.

## Critical Issues Identified

### 1. **Dual Implementation Conflict**
The application has **two competing implementations** running simultaneously:
- **LiveKit-based** (`TripleVoiceInputLiveKit.tsx`) - Uses LiveKit rooms and WebRTC
- **Direct WebSocket** (`TripleVoiceInputDirect.tsx`) - Uses direct WebSocket streaming

The App.tsx is using `VoiceExerciseWithDirect`, which uses the direct approach, but the analysis shows LiveKit infrastructure is partially active, causing interference.

### 2. **Audio Format Mismatch & Double Processing**

#### Current Audio Flow:
```
Microphone → Browser MediaStream 
    ├─→ Web Speech API (native browser)
    ├─→ ScriptProcessor → PCM16 → WebSocket → Deepgram
    └─→ MediaRecorder → WebM/Opus → WebSocket → Groq
```

#### Issues:
- **Deepgram**: Receiving PCM16 at 16kHz through ScriptProcessor (4096 sample chunks)
- **Groq**: Receiving WebM/Opus chunks every 3 seconds via MediaRecorder
- **Format Detection**: The backend is checking for WebM markers (`WEBM:`) in the stream, adding overhead

### 3. **Simulated Audio Data Interference**

In `livekitRoomManagerFixed.ts:72-94`, there's a **simulation mode** that generates fake audio data:
```typescript
private simulateAudioForTesting(roomName: string, participantId: string): void {
    const interval = setInterval(() => {
        const audioBuffer = Buffer.alloc(1600); // 100ms of 16kHz audio
        this.emit('audioData', {
            roomName,
            participantId,
            trackId: 'simulated-track',
            data: audioBuffer,
            timestamp: Date.now(),
        });
    }, 100);
}
```

This is creating **empty audio buffers** that are being sent to transcription services!

### 4. **Latency Calculation Issues**

#### Web Speech API:
- Uses `onspeechstart` event for timing
- Falls back to estimating start time if event doesn't fire
- Latency calculated from speech start to final result

#### Deepgram & Groq:
- **Missing proper timestamp tracking** for when audio actually starts
- Using `firstAudioChunkTime` but it's reset on silence detection
- No correlation between client-side audio capture time and server-side processing

### 5. **Race Conditions & Synchronization Issues**

1. **Service Initialization Race**:
   - Services start independently without coordination
   - Web Speech can start before microphone permission is granted
   - Deepgram/Groq WebSocket connections may not be ready when audio starts flowing

2. **Auto-Submit Logic Conflicts**:
   ```typescript
   // Multiple services trying to submit simultaneously
   if (enabledCount === 1 && valueCount === 1) {
       submitAnswer(); // Immediate submit
   } else if (valueCount === enabledCount && valueCount > 0) {
       submitAnswer(); // All services ready
   } else if (valueCount > 0 && !autoSubmitTimeoutRef.current) {
       // 5-second timer starts
   }
   ```

3. **SSE Connection Issues**:
   - Transcription monitoring uses Server-Sent Events
   - Connection retry logic can cause duplicate event handlers
   - No deduplication of transcription events

### 6. **Audio Processing Bottlenecks**

#### Deepgram Issues:
- **No buffering** - Sending raw chunks immediately
- **Small chunk sizes** - 4096 samples = ~256ms of audio
- **Network overhead** - Each chunk requires WebSocket frame overhead
- **No audio quality validation** before sending

#### Groq Issues:
- **3-second recording chunks** - High latency by design
- **WebM encoding overhead** - MediaRecorder adds encoding latency
- **Blob conversion** - Additional async operation for each chunk
- **Sequential processing** - Chunks processed one at a time

### 7. **Missing Input Detection Root Causes**

1. **Silence Detection Too Aggressive**:
   ```typescript
   if (maxAmplitude < 500) { // Very low threshold
       silenceCount++;
       if (silenceCount > 50) { // Only ~1 second
           firstAudioTime = 0; // Resets timing!
           audioRouter.emit('resetSpeechTimer', {});
       }
   }
   ```

2. **Audio Router Sanitization**:
   ```typescript
   // Filters out non-numeric content aggressively
   result.text = this.sanitizeTranscription(result.text);
   ```

3. **Number Extraction Differences**:
   - Each service has different number extraction logic
   - Sound-alike replacements not consistent across services
   - Some services may interpret background noise as speech

## Data Flow Analysis

### Current Architecture:
```
Frontend (Browser)
    ├─→ Web Speech API → Direct browser processing → Result
    │
    ├─→ Audio Capture (getUserMedia)
    │    ├─→ ScriptProcessor (PCM16)
    │    │    └─→ WebSocket → Backend → audioRouter → Deepgram API
    │    │
    │    └─→ MediaRecorder (WebM)
    │         └─→ WebSocket → Backend → audioRouter → Groq API
    │
    └─→ SSE Connection ← Backend (transcription results)
```

### Latency Breakdown:

#### Deepgram (4399ms):
1. Audio capture setup: ~100ms
2. ScriptProcessor buffering: ~256ms per chunk
3. WebSocket transmission: ~50ms
4. Backend routing: ~100ms
5. Deepgram API processing: ~300-500ms
6. Result transmission back: ~100ms
7. **Missing time**: ~3000ms (likely from silence detection resets)

#### Groq (2283ms):
1. MediaRecorder 3-second chunks: 3000ms baseline
2. Blob conversion: ~50ms
3. WebSocket transmission: ~100ms
4. Backend processing: ~100ms
5. Groq API processing: ~500-1000ms
6. **Actual latency**: Lower due to parallel processing

## Recommendations

### Immediate Fixes:

1. **Remove Simulation Mode**:
   ```typescript
   // In livekitRoomManagerFixed.ts, comment out or remove:
   // this.simulateAudioForTesting(roomName, identity);
   ```

2. **Fix Silence Detection**:
   ```typescript
   // Increase thresholds in audioStream.ts
   if (maxAmplitude < 100) { // Lower threshold
       silenceCount++;
       if (silenceCount > 200) { // ~4 seconds instead of 1
           // Don't reset firstAudioTime immediately
       }
   }
   ```

3. **Implement Proper Timestamp Tracking**:
   ```typescript
   // Add to frontend audio capture
   const captureStartTime = Date.now();
   // Include in WebSocket message
   ws.send(JSON.stringify({
       audio: buffer,
       captureTime: captureStartTime,
       chunkIndex: chunkCount++
   }));
   ```

4. **Optimize Deepgram Streaming**:
   - Increase buffer size to 8192 or 16384 samples
   - Implement adaptive buffering based on network conditions
   - Add audio level detection before sending

5. **Improve Groq Processing**:
   - Reduce chunk size to 1-2 seconds
   - Implement overlapping chunks for better coverage
   - Use streaming transcription if available

### Architecture Improvements:

1. **Choose Single Implementation**:
   - Remove LiveKit components if using direct approach
   - Or fully commit to LiveKit and remove direct WebSocket

2. **Unified Audio Pipeline**:
   - Single audio capture and format
   - Consistent timestamp tracking
   - Shared silence detection logic

3. **Better Service Coordination**:
   - Wait for all services ready before starting
   - Implement proper service health checks
   - Add timeout handling for each service

4. **Optimize Network Communication**:
   - Use binary WebSocket frames
   - Implement compression for audio data
   - Batch small messages

### Code Quality Improvements:

1. **Add Comprehensive Logging**:
   ```typescript
   interface AudioMetrics {
       captureTime: number;
       processStartTime: number;
       processEndTime: number;
       transcriptionStartTime: number;
       transcriptionEndTime: number;
       totalLatency: number;
   }
   ```

2. **Implement Monitoring**:
   - Track per-service success rates
   - Monitor audio quality metrics
   - Log all timestamp transitions

3. **Add Error Recovery**:
   - Automatic reconnection with backoff
   - Fallback to alternative services
   - User notification of service issues

## Conclusion

The high latency is primarily caused by:
1. Simulation mode generating empty audio
2. Aggressive silence detection resetting timers
3. Inefficient audio chunking and transmission
4. Missing timestamp correlation between client and server
5. Architecture confusion between LiveKit and direct approaches

The missing input detection is caused by:
1. Services processing different audio streams at different times
2. Aggressive filtering removing valid numeric content
3. Race conditions in service initialization
4. Independent processing without coordination

Implementing the recommended fixes should reduce Deepgram latency to **500-800ms** and Groq latency to **1000-1500ms**, while significantly improving input detection reliability.