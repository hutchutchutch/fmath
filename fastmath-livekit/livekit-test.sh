#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== FastMath LiveKit Connection Test ===${NC}"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please create a .env file with your API keys:"
    echo "  DEEPGRAM_API_KEY=your_key"
    echo "  LIVEKIT_API_KEY=your_key"
    echo "  LIVEKIT_API_SECRET=your_secret"
    echo "  LIVEKIT_URL=wss://your-server.livekit.cloud"
    echo "  GROQ_API_KEY=your_key"
    exit 1
fi

# Check if required keys are in .env
echo -e "${YELLOW}Checking environment variables...${NC}"
missing_vars=()

if ! grep -q "LIVEKIT_API_KEY=" .env || grep -q "LIVEKIT_API_KEY=\"\"" .env || grep -q "LIVEKIT_API_KEY=your_livekit_api_key" .env || grep -q "LIVEKIT_API_KEY=$" .env; then
    missing_vars+=("LIVEKIT_API_KEY")
fi

if ! grep -q "LIVEKIT_API_SECRET=" .env || grep -q "LIVEKIT_API_SECRET=\"\"" .env || grep -q "LIVEKIT_API_SECRET=your_livekit_api_secret" .env || grep -q "LIVEKIT_API_SECRET=$" .env; then
    missing_vars+=("LIVEKIT_API_SECRET")
fi

if ! grep -q "LIVEKIT_URL=" .env || grep -q "LIVEKIT_URL=\"\"" .env || grep -q "LIVEKIT_URL=wss://your-" .env || grep -q "LIVEKIT_URL=$" .env; then
    missing_vars+=("LIVEKIT_URL")
fi

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo -e "${RED}❌ Missing or invalid environment variables:${NC}"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Please update your .env file with valid values."
    exit 1
fi

echo -e "${GREEN}✅ Environment variables found${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    
    # Kill backend if running
    if [ ! -z "$BACKEND_PID" ]; then
        echo "Stopping backend..."
        kill $BACKEND_PID 2>/dev/null
        wait $BACKEND_PID 2>/dev/null
    fi
    
    # Kill frontend if running
    if [ ! -z "$FRONTEND_PID" ]; then
        echo "Stopping frontend..."
        kill $FRONTEND_PID 2>/dev/null
        wait $FRONTEND_PID 2>/dev/null
    fi
    
    # Clean up log files
    rm -f backend_test.log frontend_test.log
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Start backend
echo -e "${YELLOW}Starting backend...${NC}"
cd backend
npm run dev > ../backend_test.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
echo "Waiting for backend to start..."
for i in {1..30}; do
    if curl -s http://localhost:3001/health > /dev/null; then
        echo -e "${GREEN}✅ Backend is running${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Backend failed to start${NC}"
        echo "Check backend_test.log for errors"
        exit 1
    fi
    sleep 1
done

# Test LiveKit configuration
echo ""
echo -e "${YELLOW}Testing LiveKit configuration...${NC}"
response=$(curl -s http://localhost:3001/api/livekit/test)
configured=$(echo $response | grep -o '"configured":[^,}]*' | cut -d: -f2)

if [ "$configured" = "true" ]; then
    echo -e "${GREEN}✅ LiveKit is configured in backend${NC}"
    url=$(echo $response | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
    echo "  LiveKit URL: $url"
else
    echo -e "${RED}❌ LiveKit is not configured in backend${NC}"
    echo "Response: $response"
    exit 1
fi

# Create test app entry point
echo ""
echo -e "${YELLOW}Creating test app...${NC}"
cat > frontend/src/TestApp.tsx << 'EOF'
import React from 'react';
import LiveKitTest from './components/LiveKitTest';

function TestApp() {
  return (
    <div className="min-h-screen bg-gray-50">
      <LiveKitTest />
    </div>
  );
}

export default TestApp;
EOF

# Update index.tsx to use TestApp
cp frontend/src/index.tsx frontend/src/index.tsx.backup
cat > frontend/src/index.tsx << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import TestApp from './TestApp';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <TestApp />
  </React.StrictMode>
);
EOF

# Start frontend
echo -e "${YELLOW}Starting frontend...${NC}"
cd frontend
npm start > ../frontend_test.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for frontend to start
echo "Waiting for frontend to start..."
for i in {1..60}; do
    if curl -s http://localhost:3000 > /dev/null; then
        echo -e "${GREEN}✅ Frontend is running${NC}"
        break
    fi
    if [ $i -eq 60 ]; then
        echo -e "${RED}❌ Frontend failed to start${NC}"
        echo "Check frontend_test.log for errors"
        exit 1
    fi
    sleep 1
done

# Restore original index.tsx on cleanup
cleanup_frontend() {
    if [ -f "frontend/src/index.tsx.backup" ]; then
        mv frontend/src/index.tsx.backup frontend/src/index.tsx
    fi
    rm -f frontend/src/TestApp.tsx
}
trap 'cleanup_frontend; cleanup' EXIT INT TERM

echo ""
echo -e "${GREEN}=== LiveKit Test Environment Ready ===${NC}"
echo ""
echo -e "${BLUE}Open http://localhost:3000 in your browser to test LiveKit connection${NC}"
echo ""
echo "The test will:"
echo "  1. Check backend LiveKit configuration"
echo "  2. Request a token from the backend"
echo "  3. Connect to your LiveKit server"
echo "  4. Publish an audio track"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the test${NC}"
echo ""

# Keep script running
while true; do
    sleep 1
done