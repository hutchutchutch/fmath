// Feature flags for controlling which features are enabled
export const FEATURES = {
  // Voice input using Deepgram/LiveKit (true) or Web Speech API (false)
  VOICE_INPUT_DEEPGRAM: process.env.REACT_APP_ENABLE_DEEPGRAM === 'true',
  // Keep Web Speech API as fallback option
  VOICE_INPUT_FALLBACK: true
};