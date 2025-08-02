// Return a function to get config lazily
export const getLivekitConfig = () => ({
  url: process.env.LIVEKIT_URL || '',
  apiKey: process.env.LIVEKIT_API_KEY || '',
  apiSecret: process.env.LIVEKIT_API_SECRET || '',
});

export const livekitConfig = getLivekitConfig();

// Validate configuration
if (!livekitConfig.url || !livekitConfig.apiKey || !livekitConfig.apiSecret) {
  console.warn('⚠️  LiveKit configuration incomplete. Please check your .env file.');
  console.log('Debug - LiveKit config:', {
    url: livekitConfig.url ? 'Set' : 'Missing',
    apiKey: livekitConfig.apiKey ? 'Set' : 'Missing', 
    apiSecret: livekitConfig.apiSecret ? 'Set' : 'Missing'
  });
}