import React, { useState } from 'react';
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client';
import axios from 'axios';

const LiveKitTest: React.FC = () => {
  const [status, setStatus] = useState<string>('Not connected');
  const [token, setToken] = useState<string>('');
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string>('');

  const testBackendConnection = async () => {
    try {
      setStatus('Testing backend connection...');
      const response = await axios.get('http://localhost:3001/api/livekit/test');
      
      if (response.data.configured) {
        setStatus(`✅ Backend configured. LiveKit URL: ${response.data.url}`);
        return true;
      } else {
        setError('❌ LiveKit not configured in backend');
        setStatus('Backend not configured');
        return false;
      }
    } catch (err) {
      setError('❌ Cannot connect to backend. Is it running?');
      setStatus('Backend connection failed');
      return false;
    }
  };

  const getToken = async () => {
    try {
      setStatus('Getting token from backend...');
      const response = await axios.post('http://localhost:3001/api/livekit/token', {
        roomName: 'fastmath-test-room',
        participantName: `test-user-${Date.now()}`
      });
      
      console.log('Token response:', response.data);
      
      const tokenValue = response.data.token;
      if (typeof tokenValue !== 'string') {
        console.error('Invalid token type:', typeof tokenValue, tokenValue);
        throw new Error('Invalid token received from backend');
      }
      setToken(tokenValue);
      setStatus('✅ Token received');
      return response.data;
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Unknown error';
      setError(`❌ Failed to get token: ${errorMsg}`);
      setStatus('Token request failed');
      console.error('Token request error:', err);
      throw err;
    }
  };

  const connectToLiveKit = async () => {
    setIsConnecting(true);
    setError('');
    
    try {
      // Test backend first
      const backendOk = await testBackendConnection();
      if (!backendOk) {
        setIsConnecting(false);
        return;
      }

      // Get token
      const { token: newToken, url } = await getToken();
      
      // Create and connect to room
      setStatus('Connecting to LiveKit room...');
      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      // Set up event listeners
      newRoom.on(RoomEvent.Connected, () => {
        setStatus('✅ Connected to LiveKit room!');
        console.log('Connected to room:', newRoom.name);
        console.log('Local participant:', newRoom.localParticipant.identity);
      });

      newRoom.on(RoomEvent.Disconnected, () => {
        setStatus('Disconnected from room');
      });

      newRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        console.log('Connection quality:', quality, 'for', participant.identity);
      });

      // Connect to room
      await newRoom.connect(url, newToken);
      setRoom(newRoom);

      // Create and publish audio track
      setStatus('Creating audio track...');
      const tracks = await createLocalTracks({
        audio: true,
        video: false,
      });

      setStatus('Publishing audio track...');
      await Promise.all(tracks.map(track => newRoom.localParticipant.publishTrack(track)));
      
      setStatus('✅ Connected and publishing audio!');
    } catch (err: any) {
      console.error('Connection error:', err);
      setError(`❌ Connection failed: ${err.message}`);
      setStatus('Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    if (room) {
      room.disconnect();
      setRoom(null);
      setStatus('Disconnected');
      setToken('');
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">LiveKit Connection Test</h1>
      
      <div className="space-y-4">
        <div className="bg-gray-100 p-4 rounded">
          <p className="font-semibold">Status:</p>
          <p className={`mt-1 ${status.includes('✅') ? 'text-green-600' : 'text-gray-700'}`}>
            {status}
          </p>
        </div>

        {error && (
          <div className="bg-red-100 p-4 rounded">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {token && typeof token === 'string' && (
          <div className="bg-blue-100 p-4 rounded">
            <p className="font-semibold">Token (first 20 chars):</p>
            <p className="mt-1 text-xs font-mono">{token.substring(0, 20)}...</p>
          </div>
        )}

        <div className="flex space-x-4">
          {!room ? (
            <button
              onClick={connectToLiveKit}
              disabled={isConnecting}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isConnecting ? 'Connecting...' : 'Connect to LiveKit'}
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Disconnect
            </button>
          )}
        </div>

        <div className="mt-8 text-sm text-gray-600">
          <h2 className="font-semibold mb-2">Test Steps:</h2>
          <ol className="list-decimal list-inside space-y-1">
            <li>Click "Connect to LiveKit" to test the connection</li>
            <li>The test will verify backend configuration</li>
            <li>Request a token from the backend</li>
            <li>Connect to the LiveKit room</li>
            <li>Publish an audio track</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default LiveKitTest;