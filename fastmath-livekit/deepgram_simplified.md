# Deepgram Simplified Connection Guide

Based on research of Deepgram's official documentation and examples, here's the simplified approach:

## Key Findings

1. **We were overcomplicating the WebSocket URL parameters**
   - Deepgram can auto-detect most audio parameters
   - The simple connection works: `new WebSocket('wss://api.deepgram.com/v1/listen', ['token', apiKey])`

2. **MediaRecorder format works out of the box**
   - Use `audio/webm` mime type (browser default)
   - 250ms chunks are recommended by Deepgram
   - No need to specify encoding parameters in most cases

3. **The official browser example is extremely simple**
   ```javascript
   // 1. Get microphone
   navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
     // 2. Create recorder
     const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
     
     // 3. Connect to Deepgram
     const socket = new WebSocket('wss://api.deepgram.com/v1/listen', [
       'token',
       'YOUR_API_KEY',
     ])
     
     // 4. Handle messages
     socket.onmessage = (message) => {
       const received = JSON.parse(message.data)
       const transcript = received.channel.alternatives[0].transcript
       if (transcript && received.is_final) {
         // Use transcript
       }
     }
     
     // 5. Send audio
     mediaRecorder.addEventListener('dataavailable', (event) => {
       if (event.data.size > 0 && socket.readyState == 1) {
         socket.send(event.data)
       }
     })
     
     // 6. Start recording
     mediaRecorder.start(250)
   })
   ```

## What We Were Doing Wrong

1. **Over-specifying parameters**: We were adding encoding=webm, channels=1, sample_rate=48000, etc. when Deepgram can auto-detect these

2. **Complex token handling**: We were using Sec-WebSocket-Protocol headers when the simple array format works: `['token', apiKey]`

3. **Wrong audio format**: We tried opus encoding when webm works directly

4. **Too much error handling upfront**: Start simple, add complexity only if needed

## Simplified Implementation

See `DeepgramTest.tsx` for a working example that:
- Connects in ~10 lines of code
- Uses browser defaults
- Works immediately

## Testing

1. Visit: http://localhost:3000?test=deepgram
2. Click "Start Deepgram"
3. Speak and see transcriptions appear

## Next Steps

Once the simple version works, we can:
1. Add back latency tracking
2. Implement the dual comparison view
3. Add proper error handling
4. Optimize for the math exercise use case