# Important Note: Server-Side Audio Processing with LiveKit

## The Challenge

The LiveKit Server SDK doesn't work the same way as the Client SDK. Specifically:
- Client SDK: Can join rooms and subscribe to audio/video tracks directly
- Server SDK: Designed for administrative operations, not direct media consumption

## Current Implementation

For testing purposes, the `livekitRoomManagerFixed.ts` simulates audio data. In production, you have several options:

### Option 1: LiveKit Egress (Recommended)
Use LiveKit's Egress API to stream audio to your server:
```javascript
const egressClient = new EgressClient(url, apiKey, apiSecret);
await egressClient.startRoomCompositeEgress(roomName, {
  preset: EncodingOptionsPreset.H264_720P_30,
  output: {
    case: 'stream',
    value: {
      urls: ['rtmp://your-server/live/stream-key']
    }
  }
});
```

### Option 2: Client SDK in Node.js
Run a headless client that joins rooms:
```javascript
// Requires additional setup with headless browser or WebRTC implementation
const room = new Room();
await room.connect(url, token);
room.on('trackSubscribed', (track) => {
  // Process audio
});
```

### Option 3: WebRTC DataChannels
Use data channels to send audio data from browser to server:
```javascript
// Browser sends audio chunks via data channel
const audioData = audioContext.getAudioData();
room.localParticipant.publishData(audioData);
```

### Option 4: Separate Audio Pipeline
Have browsers send audio directly to your STT services:
- Browser → Deepgram WebSocket
- Browser → Server → Groq API
- Keep Web Speech API in browser

## Why This Matters

The current test implementation works for validating the pipeline architecture, but for production you'll need to choose one of the above approaches based on your requirements:

- **Lowest Latency**: Option 4 (direct from browser)
- **Most Scalable**: Option 1 (Egress API)
- **Most Flexible**: Option 2 (headless client)
- **Simplest**: Option 3 (data channels)

## Next Steps

For now, the simulated audio allows us to:
1. Test the audio routing logic
2. Verify Deepgram/Groq integration
3. Validate the transcription pipeline

When moving to production, implement one of the real audio capture methods above.