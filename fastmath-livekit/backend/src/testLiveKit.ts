import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

console.log('Testing LiveKit token generation...');
console.log('API Key:', process.env.LIVEKIT_API_KEY);
console.log('API Secret length:', process.env.LIVEKIT_API_SECRET?.length);
console.log('URL:', process.env.LIVEKIT_URL);

(async () => {
try {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: 'test-user',
      ttl: 3600,
    }
  );

  at.addGrant({
    roomJoin: true,
    room: 'test-room',
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();
  console.log('✅ Token generated successfully!');
  console.log('Token length:', token.length);
  console.log('Token preview:', token.substring(0, 50) + '...');
} catch (error) {
  console.error('❌ Error generating token:', error);
}
})();