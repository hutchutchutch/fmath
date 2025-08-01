#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${2}${1}${NC}"
}

print_status "🧪 Testing FastMath Speech Test Servers" "$BLUE"
echo ""

# Test backend health endpoint
print_status "Testing Backend Health..." "$YELLOW"
BACKEND_RESPONSE=$(curl -s http://localhost:3001/health)
if [ "$BACKEND_RESPONSE" == '{"status":"ok"}' ]; then
    print_status "✅ Backend is healthy" "$GREEN"
else
    print_status "❌ Backend health check failed" "$RED"
    echo "Response: $BACKEND_RESPONSE"
fi

# Test Deepgram config endpoint
print_status "" "$NC"
print_status "Testing Deepgram Configuration..." "$YELLOW"
DEEPGRAM_CONFIG=$(curl -s http://localhost:3001/api/voice/deepgram/config)
echo "Deepgram Config: $DEEPGRAM_CONFIG"
if echo "$DEEPGRAM_CONFIG" | grep -q "useSimulator"; then
    print_status "✅ Deepgram config endpoint working" "$GREEN"
    
    if echo "$DEEPGRAM_CONFIG" | grep -q '"useSimulator":true'; then
        print_status "ℹ️  Using Deepgram Simulator" "$BLUE"
        
        # Test WebSocket connection to simulator
        print_status "" "$NC"
        print_status "Testing Deepgram Simulator WebSocket..." "$YELLOW"
        
        # Use node to test WebSocket
        node -e "
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://localhost:8080');
        
        ws.on('open', () => {
            console.log('✅ WebSocket connection successful');
            ws.close();
            process.exit(0);
        });
        
        ws.on('error', (err) => {
            console.log('❌ WebSocket connection failed:', err.message);
            process.exit(1);
        });
        
        setTimeout(() => {
            console.log('❌ WebSocket connection timeout');
            process.exit(1);
        }, 5000);
        " 2>/dev/null || print_status "❌ Deepgram Simulator WebSocket test failed" "$RED"
    else
        print_status "ℹ️  Using Real Deepgram API" "$BLUE"
    fi
else
    print_status "❌ Deepgram config endpoint failed" "$RED"
fi

# Test exercise API
print_status "" "$NC"
print_status "Testing Exercise API..." "$YELLOW"
SESSION_RESPONSE=$(curl -s http://localhost:3001/api/exercise/session/new)
if echo "$SESSION_RESPONSE" | grep -q "sessionId"; then
    print_status "✅ Exercise API is working" "$GREEN"
    echo "Sample problem: $(echo $SESSION_RESPONSE | grep -o '"num1":[0-9]*,"num2":[0-9]*,"operator":"[^"]*","answer":[0-9]*' | head -1)"
else
    print_status "❌ Exercise API failed" "$RED"
    echo "Response: $SESSION_RESPONSE"
fi

# Test frontend
print_status "" "$NC"
print_status "Testing Frontend..." "$YELLOW"
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
if [ "$FRONTEND_STATUS" == "200" ]; then
    print_status "✅ Frontend is serving" "$GREEN"
else
    print_status "❌ Frontend returned status: $FRONTEND_STATUS" "$RED"
fi

print_status "" "$NC"
print_status "🏁 Test complete!" "$BLUE"
print_status "" "$NC"
print_status "📝 To test voice recognition:" "$YELLOW"
print_status "   1. Open http://localhost:3000 in Chrome/Edge" "$NC"
print_status "   2. Allow microphone access when prompted" "$NC"
print_status "   3. Say numbers clearly when problems appear" "$NC"
print_status "   4. Complete the session to see comparison results" "$NC"