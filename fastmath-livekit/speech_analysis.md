# Speech Recognition Analysis - FastMath Speech Test

This document provides a comprehensive analysis of the speech recognition implementation, covering both Web Speech API and Deepgram integration. Each step is explained with common issues and debugging strategies.

## Table of Contents
1. [Overview](#overview)
2. [Web Speech API Flow](#web-speech-api-flow)
3. [Deepgram API Flow](#deepgram-api-flow)
4. [Common Issues and Solutions](#common-issues-and-solutions)
5. [Debugging Checklist](#debugging-checklist)

## Overview

The application uses two speech recognition services simultaneously:
- **Web Speech API**: Browser-native speech recognition
- **Deepgram API**: Cloud-based real-time speech recognition via WebSocket

## Web Speech API Flow

### Step 1: Browser Compatibility Check
```javascript
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
```
**Purpose**: Checks if the browser supports Web Speech API  
**Common Issues**:
- Not supported in Firefox, Safari (partial support)
- Best support in Chrome/Edge
- Console will show: "❌ Web Speech API not supported"

### Step 2: Microphone Permission Request
```javascript
navigator.mediaDevices.getUserMedia({ audio: true })
```
**Purpose**: Requests microphone access before initializing speech recognition  
**Common Issues**:
- User denies permission → Falls back to text input
- Browser blocks due to non-HTTPS (localhost is okay)
- Microphone already in use by another application
- Console shows: "❌ Microphone permission denied"

### Step 3: Recognition Instance Creation
```javascript
const recognition = new SpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.maxAlternatives = 3;
recognition.lang = 'en-US';
```
**Purpose**: Creates and configures the recognition instance  
**Key Settings**:
- `continuous`: Keeps listening after getting results
- `interimResults`: Shows partial results while speaking
- `maxAlternatives`: Gets multiple possible interpretations

### Step 4: Event Handlers
```javascript
recognition.onstart → "✅ Web Speech API started"
recognition.onaudiostart → "🔊 Audio capture started"
recognition.onspeechstart → "🗣️ Speech detected"
recognition.onresult → Transcription results
recognition.onerror → Error handling
recognition.onend → Restart logic
```
**Purpose**: Handles the recognition lifecycle  
**Common Issues**:
- `aborted` error: Recognition stopped unexpectedly
- `no-speech` error: No speech detected (normal, continues)
- `network` error: Internet connection issues
- Rapid restart loops if not handled properly

### Step 5: Result Processing
```javascript
recognition.onresult = (event) => {
  const transcript = result[0].transcript.trim();
  const number = extractNumberFromSpeech(transcript);
}
```
**Purpose**: Extracts numbers from speech transcripts  
**Features**:
- Converts "for" to "4"
- Handles word numbers ("twenty-one" → 21)
- Only accepts final results for answers

## Deepgram API Flow

### Step 1: Backend Configuration
```javascript
// Backend: /api/voice/deepgram/config
{
  useSimulator: false,
  websocketUrl: 'wss://api.deepgram.com/v1/listen',
  needsToken: true
}
```
**Purpose**: Provides WebSocket URL and configuration  
**Common Issues**:
- Backend not running (port 3001)
- CORS issues if backend URL is wrong
- Environment variables not loaded

### Step 2: API Token Retrieval
```javascript
// Backend: /api/voice/deepgram/token
const { token } = await tokenResponse.json();
```
**Purpose**: Gets API key from backend (keeps it secure)  
**Common Issues**:
- Invalid API key in .env file
- API key lacks permissions
- Token endpoint returns 500 error
- Console shows: "❌ Failed to get Deepgram config/token"

### Step 3: Media Stream Setup
```javascript
const stream = mediaStreamRef.current; // Reuses existing stream
```
**Purpose**: Uses the same microphone stream as Web Speech API  
**Common Issues**:
- No stream available if mic permission denied
- Stream tracks not active
- Console shows: "❌ No media stream available for Deepgram"

### Step 4: WebSocket Connection
```javascript
const websocketUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&interim_results=true&encoding=webm&channels=1&sample_rate=48000`;
const socket = new WebSocket(websocketUrl, ['token', token]);
```
**Purpose**: Establishes real-time connection to Deepgram  
**Key Parameters**:
- `model=nova-2`: Latest speech model
- `encoding=webm`: Matches MediaRecorder output
- `interim_results=true`: Get partial transcriptions
- Uses Sec-WebSocket-Protocol for authentication

**Common Issues**:
- Wrong encoding format (opus vs webm)
- Invalid token in WebSocket protocol
- Network/firewall blocking WebSocket
- CORS not applicable (WebSocket bypasses CORS)

### Step 5: Audio Streaming
```javascript
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus'
});
mediaRecorder.ondataavailable = (event) => {
  socket.send(event.data);
};
mediaRecorder.start(100); // Send chunks every 100ms
```
**Purpose**: Captures and streams audio to Deepgram  
**Common Issues**:
- Unsupported MIME type
- WebSocket not in OPEN state
- Audio chunks too small/large
- Console shows: "📤 Sending audio chunk to Deepgram, size: XXXX"

### Step 6: Transcription Reception
```javascript
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.channel?.alternatives?.[0]?.transcript) {
    // Process transcription
  }
}
```
**Purpose**: Receives and processes transcriptions  
**Message Types**:
- `Metadata`: Initial connection info
- `Results`: Transcription results
  - `is_final`: Final transcription
  - `speech_final`: End of speech segment

**Common Issues**:
- Empty transcripts in results
- Different message format than expected
- No audio being recognized
- **Variable scope errors in message handler**

#### Scope Error in Transcription Processing
**Symptoms**: TypeScript compilation errors like:
- `Cannot find name 'isFinal'`
- `Cannot find name 'transcript'`
- `'catch' or 'finally' expected`

**Cause**: Variables declared inside conditional blocks but used outside their scope.

**Incorrect Code Structure**:
```javascript
socket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'Results') {
      if (data.channel?.alternatives?.[0]) {
        const transcript = data.channel.alternatives[0].transcript || '';
        const isFinal = data.is_final || false;
      }
      // ERROR: transcript and isFinal not accessible here
      if (!isFinal) {
        setInterim(transcript); // Variables out of scope
      }
    }
  } catch (error) {
    console.error('Failed to parse:', error);
  }
};
```

**Correct Code Structure**:
```javascript
socket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'Results') {
      if (data.channel?.alternatives?.[0]) {
        const transcript = data.channel.alternatives[0].transcript || '';
        const isFinal = data.is_final || false;
        
        // All usage of transcript and isFinal must be within this block
        if (transcript) {
          console.log('Transcript:', transcript, 'Final:', isFinal);
          
          if (!isFinal) {
            setInterim(transcript);
          } else {
            // Process final transcript
            processTranscript(transcript);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to parse:', error);
  }
};
```

**Key Points**:
- Variables must be used within the scope where they're declared
- Ensure all conditional logic is properly nested
- Check that all opening braces have corresponding closing braces
- Use TypeScript's strict mode to catch these errors early

## Common Issues and Solutions

### Issue 1: Web Speech API Constantly Restarting
**Symptoms**: Rapid "ended" and "started" events  
**Causes**:
- Multiple instances created
- Component re-rendering
- Cleanup not preventing restarts

**Solution**: 
- Check for existing instance before creating
- Use proper cleanup with `abort()`
- Prevent restart in `onend` during cleanup

### Issue 2: Deepgram Not Returning Transcriptions
**Symptoms**: Connected but no transcripts received  
**Common Causes**:
1. **Invalid API Key**
   - Check: API key in .env file
   - Verify: Key has speech-to-text permissions
   - Test: Try key in Deepgram playground

2. **Audio Format Mismatch**
   - MediaRecorder produces: `audio/webm`
   - Deepgram expects: Must match `encoding` parameter
   - Fix: Ensure `encoding=webm` in URL

3. **Silent Audio**
   - Check: Microphone volume/gain
   - Test: Record and playback locally
   - Debug: Log audio chunk sizes

4. **WebSocket Issues**
   - Check: Connection established (readyState === 1)
   - Monitor: Any error messages
   - Verify: Token properly sent in protocol

### Issue 3: High Latency
**Web Speech API**:
- Measures from speech start (onspeechstart)
- Normal: 1-3 seconds for final result
- High latency often due to:
  - Waiting for silence to finalize
  - Poor internet connection
  - Complex speech patterns

**Deepgram**:
- Streaming provides faster interim results
- Final results depend on speech patterns
- Latency includes network round-trip

### Issue 4: TypeScript Scope Errors in Message Handlers
**Symptoms**: Compilation fails with errors like:
- `TS2304: Cannot find name 'isFinal'`
- `TS2304: Cannot find name 'transcript'`
- `TS1472: 'catch' or 'finally' expected`
- Component returns void instead of ReactElement

**Causes**:
1. **Variable Scope Issues**
   - Variables declared inside conditional blocks
   - Attempting to use variables outside their scope
   - Missing closing braces causing scope confusion

2. **Code Structure Problems**
   - Improperly nested conditional statements
   - Logic that spans multiple scope levels
   - Functions defined outside component but using component variables

**Solution**:
```typescript
// Ensure variables are declared at the appropriate scope level
socket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    
    if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
      // Declare AND use variables within the same scope
      const transcript = data.channel.alternatives[0].transcript || '';
      const isFinal = data.is_final || data.speech_final || false;
      
      if (transcript) {
        // All transcript processing happens here
        handleTranscript(transcript, isFinal);
      }
    }
  } catch (error) {
    console.error('Parse error:', error);
  }
};
```

**Prevention**:
- Use TypeScript strict mode
- Enable ESLint rules for scope checking
- Keep conditional logic simple and well-nested
- Extract complex logic into separate functions

## Debugging Checklist

### Console Logs to Check

1. **Initialization**
   ```
   🎤 Requesting microphone permission...
   ✅ Microphone permission granted
   🎤 Initializing Web Speech API...
   🌐 Initializing Deepgram...
   ```

2. **Web Speech API**
   ```
   ✅ Web Speech API started
   🗣️ Web Speech: Speech started at XXXms after problem shown
   📝 Web Speech result event
   🗣️ Web Speech transcript: "XXX"
   ```

3. **Deepgram Connection**
   ```
   📋 Deepgram config: {useSimulator: false, ...}
   🔑 Got Deepgram token: Yes
   ✅ Deepgram WebSocket connected
   📤 Sending audio chunk to Deepgram, size: XXXX
   📨 Deepgram message: {type: "Results", ...}
   ```

### Browser DevTools

1. **Network Tab**
   - Check `/api/voice/deepgram/config` - Should return 200
   - Check `/api/voice/deepgram/token` - Should return 200
   - Check WebSocket connection to `wss://api.deepgram.com`

2. **Console Errors**
   - CORS errors (shouldn't happen with WebSocket)
   - WebSocket connection failures
   - MediaRecorder errors

3. **Application Tab**
   - Check microphone permissions
   - Verify no other tabs using microphone

### Testing Steps

1. **Test Microphone**
   ```javascript
   // In console:
   navigator.mediaDevices.getUserMedia({audio: true})
     .then(stream => console.log('Mic works!', stream.getTracks()))
     .catch(err => console.error('Mic error:', err));
   ```

2. **Test Deepgram Directly**
   ```bash
   # Test API key with curl
   curl -X POST 'https://api.deepgram.com/v1/listen' \
     -H 'Authorization: Token YOUR_API_KEY' \
     -H 'Content-Type: audio/wav' \
     --data-binary @test.wav
   ```

3. **Check Audio Recording**
   - Use browser's MediaRecorder to record
   - Play back to verify audio quality
   - Check if audio is actually being captured

### Environment Variables

Ensure `.env` file in backend has:
```
DEEPGRAM_API_KEY=your_valid_api_key
USE_DEEPGRAM_SIMULATOR=false
```

### Common Fixes

1. **For Web Speech API issues**:
   - Use Chrome/Edge browser
   - Allow microphone permissions
   - Check for other apps using microphone
   - Refresh page if stuck

2. **For Deepgram issues**:
   - Verify API key is valid
   - Check API key permissions in Deepgram console
   - Ensure audio format matches
   - Test with simulator first (`USE_DEEPGRAM_SIMULATOR=true`)
   - Check WebSocket connection in Network tab

3. **For both services**:
   - Ensure backend is running
   - Check browser console for errors
   - Verify microphone is working
   - Test in incognito mode (no extensions)

## Next Steps for Debugging

1. **Enable More Logging**
   - Add `console.log(JSON.stringify(data, null, 2))` for all Deepgram messages
   - Log MediaRecorder state changes
   - Log WebSocket readyState changes

2. **Test Audio Pipeline**
   - Record audio locally and verify it's not silent
   - Check audio levels with Web Audio API
   - Send test audio file to Deepgram API

3. **Verify API Key**
   - Log into Deepgram Console
   - Check API key permissions
   - Generate new key if needed
   - Test key with their playground

4. **Network Analysis**
   - Use Wireshark to inspect WebSocket frames
   - Check for proxy/firewall issues
   - Test from different network

This comprehensive analysis should help identify why Deepgram isn't returning transcriptions. The most common issues are API key problems or audio format mismatches.