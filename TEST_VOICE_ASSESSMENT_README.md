# Test Voice Assessment with Deepgram + LiveKit

## Overview

A test assessment page has been created to test the Deepgram and LiveKit voice input integration with the FastMath assessment interface.

## Features

- 5 hardcoded addition questions: "5 + 8", "2 + 4", "10 + 8", "1 + 1", "3 + 6"
- Uses the same question layout and number pad as the regular assessments
- Toggle between voice input (Deepgram + LiveKit) and keyboard/numberpad input
- Real-time transcription display
- Automatic answer submission when voice input is recognized
- Progress tracking and results summary

## How to Access

1. Make sure the application is running with the startup script:
   ```bash
   ./start-fastmath.sh
   ```

2. Login to the application

3. Navigate to the test assessment page:
   ```
   http://localhost:3001/test-voice-assessment
   ```

## How to Use

1. **With Voice Input (default)**:
   - The microphone will automatically start listening when the page loads
   - Simply say the answer out loud (e.g., "thirteen" or "13")
   - The system will recognize numbers spoken as words or digits
   - Your transcript will appear below the input field
   - The answer will be automatically submitted when recognized

2. **With Keyboard/Number Pad**:
   - Uncheck the "Use Voice Input" checkbox
   - Use the on-screen number pad or keyboard to enter answers
   - Answers are auto-submitted when the correct number of digits is entered

## Voice Recognition Support

The system recognizes:
- Direct numbers: "5", "13", "18", etc.
- Word numbers: "five", "thirteen", "eighteen"
- Common number words up to twenty

## Troubleshooting

1. **Microphone Permission**: 
   - Make sure to allow microphone access when prompted
   - Check browser settings if voice input isn't working

2. **Voice Not Recognized**:
   - Speak clearly and wait a moment after speaking
   - The transcript will show what was heard
   - Try saying the number differently (e.g., "thirteen" vs "one three")

3. **Connection Issues**:
   - Check that the backend voice service is running
   - Look for error messages below the input field
   - Toggle to keyboard input if voice isn't working

## Technical Details

- **Frontend Component**: `/src/components/TestVoiceAssessment/TestVoiceAssessment.tsx`
- **Voice Input Component**: `/src/components/TestVoiceAssessment/VoiceInputLiveKit.tsx`
- **Route**: `/test-voice-assessment` (protected route requiring authentication)
- **Backend Endpoints**: Uses `/voice/token` for LiveKit authentication

## Next Steps

Once tested and working properly, this voice input integration can be:
1. Added to the regular assessment pages
2. Integrated into practice modes
3. Extended to support more complex number recognition
4. Enhanced with visual feedback for voice activity