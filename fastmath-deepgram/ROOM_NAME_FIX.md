# Room Name Mismatch Fix

## Problem
The frontend was creating a unique room name like `fastmath-1754025889366`, but Deepgram transcriptions were being sent with roomName `default`, causing them to be ignored.

## Root Cause
The audioRouter was hardcoding `roomName: 'default'` when handling Deepgram transcriptions, instead of using the actual room name from the audio stream.

## Solution
Added room/participant tracking to the AudioRouter class:

1. Added instance variables to track current room:
   ```typescript
   private currentRoomName: string = 'default';
   private currentParticipantId: string = 'user';
   ```

2. Update these values when receiving audio data:
   ```typescript
   // In handleAudioData
   this.currentRoomName = roomName;
   this.currentParticipantId = participantId;
   
   // In handleWebMAudioData
   this.currentRoomName = roomName;
   this.currentParticipantId = participantId;
   ```

3. Use tracked values in Deepgram transcription handler:
   ```typescript
   this.handleTranscription({
     service: 'deepgram',
     text: transcript,
     latency,
     timestamp: Date.now(),
     participantId: this.currentParticipantId,
     roomName: this.currentRoomName,
   });
   ```

## Additional Fixes

1. **Re-enabled sanitization**: The number-only filtering is now active again
2. **Better filtering**: Only emits transcriptions with meaningful content

## Testing
After restarting the backend, you should see:
- Deepgram transcriptions will have the correct room name
- All three services (Web Speech, Deepgram, Groq) will show in the UI
- Non-numeric content will be filtered out

## Notes
- The frontend creates a unique room name per session
- This ensures multiple users don't interfere with each other
- All services now use consistent room names