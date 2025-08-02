#!/bin/bash

echo "Starting test server on http://localhost:8080"
echo "Open http://localhost:8080/test-livekit-simple.html in your browser"
echo ""
echo "Make sure the backend is running (cd backend && npm run dev)"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start Python HTTP server
python3 -m http.server 8080