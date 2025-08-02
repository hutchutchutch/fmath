#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== LiveKit React Integration Test ===${NC}"
echo ""

# Function to kill process on port
kill_port() {
    local port=$1
    echo -e "${YELLOW}Checking for processes on port $port...${NC}"
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pids" ]; then
        echo -e "${YELLOW}Found process(es) on port $port: $pids${NC}"
        echo "Killing process(es)..."
        echo $pids | xargs kill -9 2>/dev/null
        sleep 1
        echo -e "${GREEN}✅ Port $port cleared${NC}"
    else
        echo -e "${GREEN}✅ Port $port is available${NC}"
    fi
}

# Function to wait for port
wait_for_port() {
    local port=$1
    local service=$2
    local max_attempts=30
    local attempt=0
    
    echo -e "${YELLOW}Waiting for $service on port $port...${NC}"
    while [ $attempt -lt $max_attempts ]; do
        if lsof -ti:$port >/dev/null 2>&1; then
            echo -e "${GREEN}✅ $service is running on port $port${NC}"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    
    echo -e "${RED}❌ $service failed to start on port $port${NC}"
    return 1
}

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    
    # Kill backend if we started it
    if [ ! -z "$BACKEND_PID" ]; then
        echo "Stopping backend..."
        kill $BACKEND_PID 2>/dev/null
        wait $BACKEND_PID 2>/dev/null
    fi
    
    # Kill frontend if we started it
    if [ ! -z "$FRONTEND_PID" ]; then
        echo "Stopping frontend..."
        kill $FRONTEND_PID 2>/dev/null
        wait $FRONTEND_PID 2>/dev/null
    fi
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check environment files
echo -e "${YELLOW}Checking environment configuration...${NC}"
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ Error: backend/.env file not found${NC}"
    echo "Please create backend/.env with:"
    echo "  DEEPGRAM_API_KEY=your_key"
    echo "  GROQ_API_KEY=your_key"
    echo "  LIVEKIT_API_KEY=your_key (optional)"
    echo "  LIVEKIT_API_SECRET=your_secret (optional)"
    echo "  LIVEKIT_URL=wss://your-server.livekit.cloud (optional)"
    exit 1
fi

# Check for required API keys
MISSING_KEYS=false
if ! grep -q "DEEPGRAM_API_KEY=" backend/.env; then
    echo -e "${RED}❌ DEEPGRAM_API_KEY not found in backend/.env${NC}"
    MISSING_KEYS=true
fi

if ! grep -q "GROQ_API_KEY=" backend/.env; then
    echo -e "${RED}❌ GROQ_API_KEY not found in backend/.env${NC}"
    MISSING_KEYS=true
fi

if [ "$MISSING_KEYS" = true ]; then
    echo -e "${RED}Please add the missing API keys to backend/.env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Environment configured${NC}"
echo ""

# Clear ports
echo -e "${BLUE}Step 1: Clearing required ports...${NC}"
kill_port 3000  # Frontend
kill_port 3001  # Backend
echo ""

# Install dependencies if needed
echo -e "${BLUE}Step 2: Installing dependencies...${NC}"

# Backend dependencies
echo -e "${YELLOW}Checking backend dependencies...${NC}"
cd backend
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
else
    echo -e "${GREEN}✅ Backend dependencies up to date${NC}"
fi
cd ..

# Frontend dependencies
echo -e "${YELLOW}Checking frontend dependencies...${NC}"
cd frontend
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
else
    echo -e "${GREEN}✅ Frontend dependencies up to date${NC}"
fi
cd ..
echo ""

# Start backend
echo -e "${BLUE}Step 3: Starting backend...${NC}"
cd backend
npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend
if wait_for_port 3001 "Backend"; then
    # Test backend endpoints
    echo -e "${YELLOW}Testing backend endpoints...${NC}"
    
    # Test exercise endpoint
    if curl -s http://localhost:3001/api/exercise/session/new | grep -q "sessionId"; then
        echo -e "${GREEN}✅ Exercise endpoint working${NC}"
    else
        echo -e "${RED}❌ Exercise endpoint not responding${NC}"
        echo "Backend log tail:"
        tail -20 backend.log
    fi
    
    # Test audio stream endpoint
    if curl -s http://localhost:3001/api/audio-stream/status | grep -q "status"; then
        echo -e "${GREEN}✅ Audio stream endpoint working${NC}"
    else
        echo -e "${YELLOW}⚠️  Audio stream endpoint not found (this is okay)${NC}"
    fi
else
    echo -e "${RED}Backend failed to start. Check backend.log for errors:${NC}"
    tail -50 backend.log
    exit 1
fi
echo ""

# Start frontend
echo -e "${BLUE}Step 4: Starting frontend...${NC}"
cd frontend
export BROWSER=none  # Prevent auto-opening browser
npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for frontend
if wait_for_port 3000 "Frontend"; then
    echo -e "${GREEN}✅ Frontend is ready${NC}"
else
    echo -e "${RED}Frontend failed to start. Check frontend.log for errors:${NC}"
    tail -50 frontend.log
    exit 1
fi
echo ""

# Final instructions
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}🎉 All services are running successfully!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""
echo -e "${BLUE}Frontend:${NC} http://localhost:3000"
echo -e "${BLUE}Backend:${NC} http://localhost:3001"
echo ""
echo -e "${YELLOW}To test the application:${NC}"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Click 'Start' to begin the exercise"
echo "3. Grant microphone permission when prompted"
echo "4. Speak numbers clearly (e.g., 'five', 'twenty', 'forty-two')"
echo ""
echo -e "${YELLOW}Backend logs:${NC} tail -f backend.log"
echo -e "${YELLOW}Frontend logs:${NC} tail -f frontend.log"
echo ""
echo -e "${YELLOW}Expected backend logs when speaking:${NC}"
echo "  📤 PCM16 chunk received for Deepgram"
echo "  📹 WebM chunk received for Groq"
echo "  📝 Transcription results"
echo ""
echo -e "${RED}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running and show logs
echo -e "${BLUE}Monitoring services (press Ctrl+C to stop)...${NC}"
echo -e "${YELLOW}Backend logs:${NC}"
tail -f backend.log