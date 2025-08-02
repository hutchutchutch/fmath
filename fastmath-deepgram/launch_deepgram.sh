#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Deepgram Test Environment${NC}"
echo "=================================="

# Check if backend is already running on port 3001
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${YELLOW}⚠️  Port 3001 is already in use. Stopping existing process...${NC}"
    lsof -ti:3001 | xargs kill -9
    sleep 2
fi

# Check if frontend is already running on port 3000
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${YELLOW}⚠️  Port 3000 is already in use. Stopping existing process...${NC}"
    lsof -ti:3000 | xargs kill -9
    sleep 2
fi

# Start backend
echo -e "${GREEN}📦 Starting backend server...${NC}"
cd backend
npm run dev > ../backend_deepgram.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
echo -e "${BLUE}⏳ Waiting for backend to start...${NC}"
sleep 3

# Check if backend started successfully
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}✅ Backend running on port 3001${NC}"
else
    echo -e "${RED}❌ Backend failed to start. Check backend_deepgram.log${NC}"
    exit 1
fi

# Start frontend
echo -e "${GREEN}🎨 Starting frontend...${NC}"
cd ../frontend
npm start > ../frontend_deepgram.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to compile
echo -e "${BLUE}⏳ Waiting for frontend to compile...${NC}"
sleep 5

# Function to check if frontend is ready
check_frontend() {
    if grep -q "Compiled successfully" ../frontend_deepgram.log 2>/dev/null || \
       grep -q "webpack compiled successfully" ../frontend_deepgram.log 2>/dev/null; then
        return 0
    fi
    return 1
}

# Wait up to 30 seconds for frontend to compile
COUNTER=0
while [ $COUNTER -lt 30 ]; do
    if check_frontend; then
        echo -e "${GREEN}✅ Frontend compiled successfully${NC}"
        break
    fi
    echo -e "${BLUE}⏳ Still compiling... ($COUNTER/30)${NC}"
    sleep 1
    COUNTER=$((COUNTER + 1))
done

if [ $COUNTER -eq 30 ]; then
    echo -e "${RED}❌ Frontend compilation timeout. Check frontend_deepgram.log${NC}"
fi

# Open browser with Deepgram test
echo -e "${GREEN}🌐 Opening Deepgram test in browser...${NC}"
sleep 2

# Detect OS and open browser accordingly
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open "http://localhost:3000?test=deepgram"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    xdg-open "http://localhost:3000?test=deepgram" 2>/dev/null || echo "Please open http://localhost:3000?test=deepgram in your browser"
else
    # Windows or other
    echo "Please open http://localhost:3000?test=deepgram in your browser"
fi

echo ""
echo -e "${BLUE}=================================="
echo -e "🎤 Deepgram Test Environment Ready!"
echo -e "=================================="
echo -e "${NC}"
echo "Test URL: http://localhost:3000?test=deepgram"
echo ""
echo -e "${YELLOW}📋 Instructions:${NC}"
echo "1. Click 'Start Deepgram' button"
echo "2. Allow microphone access when prompted"
echo "3. Speak clearly and watch for transcriptions"
echo "4. Check browser console for detailed logs"
echo ""
echo -e "${YELLOW}📊 Log files:${NC}"
echo "- Backend: backend_deepgram.log"
echo "- Frontend: frontend_deepgram.log"
echo ""
echo -e "${YELLOW}🛑 To stop:${NC} Press Ctrl+C"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🧹 Cleaning up...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    
    # Also kill any orphaned node processes on the ports
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    
    echo -e "${GREEN}✅ Servers stopped${NC}"
    exit 0
}

# Set up trap to cleanup on Ctrl+C
trap cleanup INT

# Keep script running and show logs
echo -e "${BLUE}📡 Monitoring servers... (Press Ctrl+C to stop)${NC}"
echo ""

# Tail both log files
tail -f backend_deepgram.log frontend_deepgram.log