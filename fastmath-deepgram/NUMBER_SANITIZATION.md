# Number Sanitization Updates

## Overview
Added prompts and sanitization to ensure Deepgram and Groq Whisper models focus on numerical content only.

## Changes Made

### 1. Deepgram Configuration
- Added `numerals=true` parameter to convert number words to digits
- Added keyword boosting for common number words (zero through ninety, hundred)
- Keywords help Deepgram prioritize these words in transcription

### 2. Groq Whisper Prompt
- Added specific prompt to guide Whisper model:
  ```
  "This audio contains spoken numbers only. Transcribe only numerical digits and number words. 
   Expected numbers: zero, one, two, three, four, five... Focus on numerical content only."
  ```
- Prompt is sent with every transcription request

### 3. Transcription Sanitization
- Added `sanitizeTranscription()` method that filters out all non-numerical content
- Only keeps:
  - Number words (zero, one, two, etc.)
  - Digits (0, 1, 2, etc.)
  - Compound numbers (twenty-one, thirty-five, etc.)
- Removes any other words or phrases

### 4. Enhanced Number Extraction
- Supports numbers 0-99 including:
  - Single digits: "five" → 5
  - Teens: "thirteen" → 13
  - Tens: "twenty" → 20
  - Compound numbers: "twenty-one" → 21, "ninety-nine" → 99
- Handles both hyphenated and space-separated compounds

### 5. Validation
- Transcriptions without numerical content are filtered out
- Only transcriptions containing valid numbers are emitted to the frontend

## Example Flow

1. **User says**: "Hello, the number is five"
2. **Raw transcription**: "Hello, the number is five"
3. **Sanitized**: "five"
4. **Extracted number**: 5
5. **Displayed**: "five" (text) and 5 (number)

## Testing

After restarting the backend:

1. Try saying numbers with extra words:
   - "The answer is twenty-five" → Should display "twenty five" and 25
   - "Um, I think it's seven" → Should display "seven" and 7
   - "Hello world" → Should be filtered out completely

2. Test various number formats:
   - Single digits: "three", "8"
   - Teens: "thirteen", "19"
   - Tens: "twenty", "50"
   - Compounds: "twenty-one", "forty-two", "ninety-nine"

3. Non-numerical content should be ignored:
   - Background noise
   - Filler words ("um", "uh", "like")
   - Non-number words

## Backend Logs

You should see:
```
📝 DEEPGRAM transcription: {
  originalText: "the number is five",
  sanitizedText: "five",
  number: 5,
  ...
}
🚀 Emitting transcription event
```

Or if no numbers detected:
```
⚠️ Skipping transcription - no numerical content found
```