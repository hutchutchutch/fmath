import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

export const livekitConfig = {
  apiKey: process.env.LIVEKIT_API_KEY || '',
  apiSecret: process.env.LIVEKIT_API_SECRET || '',
  url: process.env.LIVEKIT_URL || '',
};

export async function createToken(roomName: string, participantName: string): Promise<string> {
  if (!livekitConfig.apiKey || !livekitConfig.apiSecret) {
    throw new Error('LiveKit API key and secret are required');
  }

  try {
    const token = new AccessToken(
      livekitConfig.apiKey,
      livekitConfig.apiSecret,
      {
        identity: participantName,
        ttl: 3600, // Token valid for 1 hour (in seconds)
      }
    );

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();
    console.log('Token JWT generated successfully, length:', jwt.length);
    return jwt;
  } catch (error) {
    console.error('Error in createToken:', error);
    throw error;
  }
}

export function validateLiveKitConfig(): boolean {
  const { apiKey, apiSecret, url } = livekitConfig;
  
  if (!apiKey || !apiSecret || !url) {
    console.error('❌ LiveKit configuration is incomplete:');
    if (!apiKey) console.error('  - Missing LIVEKIT_API_KEY');
    if (!apiSecret) console.error('  - Missing LIVEKIT_API_SECRET');
    if (!url) console.error('  - Missing LIVEKIT_URL');
    return false;
  }
  
  console.log('✅ LiveKit configuration validated');
  console.log(`  - URL: ${url}`);
  console.log(`  - API Key: ${apiKey.substring(0, 8)}...`);
  
  return true;
}