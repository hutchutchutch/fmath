# LiveKit API Fix

## Issue
TypeScript compilation error:
```
ERROR in src/components/TripleVoiceInputLiveKit.tsx:282:37
TS2551: Property 'publishTracks' does not exist on type 'LocalParticipant'. Did you mean 'publishTrack'?
```

## Root Cause
The LiveKit client SDK API uses `publishTrack()` (singular) to publish tracks one at a time, not `publishTracks()` (plural).

## Solution
Changed from:
```typescript
await room.localParticipant.publishTracks(tracks);
```

To:
```typescript
for (const track of tracks) {
  await room.localParticipant.publishTrack(track);
}
```

## Verification
The TypeScript error has been resolved. The application should now compile successfully.

## Testing
1. Refresh the browser at http://localhost:3000
2. The app should connect to LiveKit without errors
3. Audio tracks should be published successfully
4. All three speech recognition services should work