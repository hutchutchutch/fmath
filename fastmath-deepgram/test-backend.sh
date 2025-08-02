#!/bin/bash

echo "Testing Backend Endpoints"
echo "========================"
echo ""

# Test if backend is running
echo "1. Testing if backend is running on port 3001..."
curl -s http://localhost:3001/api/exercise/session/new | jq '.' || echo "Backend not responding"

echo ""
echo "2. Testing audio stream status..."
curl -s http://localhost:3001/api/audio-stream/status | jq '.' || echo "Audio stream endpoint not found"

echo ""
echo "3. Testing LiveKit test endpoint..."
curl -s http://localhost:3001/api/livekit/test | jq '.' || echo "LiveKit test endpoint not found"

echo ""
echo "If you see 'Backend not responding', make sure the backend is running:"
echo "  cd backend && npm run dev"