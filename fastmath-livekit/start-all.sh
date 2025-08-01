#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}╔════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║     FastMath LiveKit Audio System      ║${NC}"
echo -e "${PURPLE}╚════════════════════════════════════════╝${NC}"
echo ""

# Function to kill process on port
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pids" ]; then
        echo -e "  ${YELLOW}→ Port $port in use by PID(s): $pids${NC}"
        echo -e "  ${YELLOW}→ Killing process(es)...${NC}"
        echo $pids | xargs kill -9 2>/dev/null
        sleep 1
        echo -e "  ${GREEN}✓ Port $port cleared${NC}"
    else
        echo -e "  ${GREEN}✓ Port $port available${NC}"
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for service
wait_for_service() {
    local port=$1
    local name=$2
    local max_wait=30
    local elapsed=0
    
    echo -ne "${YELLOW}  → Waiting for $name...${NC}"
    while [ $elapsed -lt $max_wait ]; do
        if lsof -ti:$port >/dev/null 2>&1; then
            echo -e "\r  ${GREEN}✓ $name started successfully${NC}    "
            return 0
        fi
        echo -ne "\r  ${YELLOW}→ Waiting for $name... ${elapsed}s${NC}"
        sleep 1
        elapsed=$((elapsed + 1))
    done
    
    echo -e "\r  ${RED}✗ $name failed to start after ${max_wait}s${NC}"
    return 1
}

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down services...${NC}"
    
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
        echo -e "  ${GREEN}✓ Backend stopped${NC}"
    fi
    
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo -e "  ${GREEN}✓ Frontend stopped${NC}"
    fi
    
    # Clean up any orphaned processes
    kill_port 3000 >/dev/null 2>&1
    kill_port 3001 >/dev/null 2>&1
    
    echo -e "${GREEN}✨ Cleanup complete${NC}"
    exit 0
}

trap cleanup EXIT INT TERM

# System checks
echo -e "${BLUE}📋 System Checks${NC}"
echo -e "${BLUE}════════════════${NC}"

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node -v)
    echo -e "  ${GREEN}✓ Node.js ${NODE_VERSION}${NC}"
else
    echo -e "  ${RED}✗ Node.js not found${NC}"
    echo "    Please install Node.js from https://nodejs.org"
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm -v)
    echo -e "  ${GREEN}✓ npm ${NPM_VERSION}${NC}"
else
    echo -e "  ${RED}✗ npm not found${NC}"
    exit 1
fi

echo ""

# Environment check
echo -e "${BLUE}🔐 Environment Configuration${NC}"
echo -e "${BLUE}═══════════════════════════${NC}"

if [ ! -f "backend/.env" ]; then
    echo -e "  ${RED}✗ backend/.env not found${NC}"
    echo ""
    echo -e "${YELLOW}Creating backend/.env template...${NC}"
    cat > backend/.env << EOF
# Required API Keys
DEEPGRAM_API_KEY=your_deepgram_key_here
GROQ_API_KEY=your_groq_key_here

# Optional LiveKit Configuration
LIVEKIT_API_KEY=your_livekit_key_here
LIVEKIT_API_SECRET=your_livekit_secret_here
LIVEKIT_URL=wss://your-project.livekit.cloud

# Server Configuration
PORT=3001
EOF
    echo -e "${GREEN}✓ Created backend/.env template${NC}"
    echo ""
    echo -e "${YELLOW}Please edit backend/.env and add your API keys:${NC}"
    echo "  1. Get Deepgram API key from: https://console.deepgram.com/"
    echo "  2. Get Groq API key from: https://console.groq.com/keys"
    echo ""
    echo -e "${YELLOW}Then run this script again.${NC}"
    exit 1
fi

# Check API keys
MISSING_KEYS=false
echo -e "  ${YELLOW}→ Checking API keys...${NC}"

if grep -q "DEEPGRAM_API_KEY=your_deepgram_key_here" backend/.env || ! grep -q "DEEPGRAM_API_KEY=.." backend/.env; then
    echo -e "  ${RED}✗ DEEPGRAM_API_KEY not configured${NC}"
    MISSING_KEYS=true
else
    echo -e "  ${GREEN}✓ DEEPGRAM_API_KEY configured${NC}"
fi

if grep -q "GROQ_API_KEY=your_groq_key_here" backend/.env || ! grep -q "GROQ_API_KEY=.." backend/.env; then
    echo -e "  ${RED}✗ GROQ_API_KEY not configured${NC}"
    MISSING_KEYS=true
else
    echo -e "  ${GREEN}✓ GROQ_API_KEY configured${NC}"
fi

if [ "$MISSING_KEYS" = true ]; then
    echo ""
    echo -e "${RED}Please configure the missing API keys in backend/.env${NC}"
    exit 1
fi

echo ""

# Port management
echo -e "${BLUE}🔌 Port Management${NC}"
echo -e "${BLUE}═════════════════${NC}"
kill_port 3000
kill_port 3001
echo ""

# Dependencies
echo -e "${BLUE}📦 Dependencies${NC}"
echo -e "${BLUE}══════════════${NC}"

# Backend dependencies
echo -e "${YELLOW}Backend dependencies:${NC}"
cd backend
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo -e "  ${YELLOW}→ Installing...${NC}"
    npm install --silent
    echo -e "  ${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "  ${GREEN}✓ Backend dependencies up to date${NC}"
fi
cd ..

# Frontend dependencies
echo -e "${YELLOW}Frontend dependencies:${NC}"
cd frontend
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo -e "  ${YELLOW}→ Installing...${NC}"
    npm install --silent
    echo -e "  ${GREEN}✓ Frontend dependencies installed${NC}"
else
    echo -e "  ${GREEN}✓ Frontend dependencies up to date${NC}"
fi
cd ..
echo ""

# Start services
echo -e "${BLUE}🚀 Starting Services${NC}"
echo -e "${BLUE}═══════════════════${NC}"

# Start backend
echo -e "${YELLOW}Backend service:${NC}"
cd backend
npm run dev > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

if wait_for_service 3001 "Backend"; then
    # Quick endpoint test
    if curl -s http://localhost:3001/api/exercise/session/new | grep -q "sessionId" 2>/dev/null; then
        echo -e "  ${GREEN}✓ API endpoints verified${NC}"
    else
        echo -e "  ${YELLOW}⚠ API endpoint test failed${NC}"
    fi
else
    echo -e "${RED}Backend failed to start. Recent logs:${NC}"
    tail -20 backend.log
    exit 1
fi

# Start frontend
echo -e "${YELLOW}Frontend service:${NC}"
cd frontend
export BROWSER=none
npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

if wait_for_service 3000 "Frontend"; then
    echo -e "  ${GREEN}✓ React app ready${NC}"
else
    echo -e "${RED}Frontend failed to start. Recent logs:${NC}"
    tail -20 frontend.log
    exit 1
fi

echo ""

# Success message
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        🎉 System Ready! 🎉             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📍 URLs:${NC}"
echo -e "   Frontend: ${PURPLE}http://localhost:3000${NC}"
echo -e "   Backend:  ${PURPLE}http://localhost:3001${NC}"
echo ""
echo -e "${BLUE}🎤 Testing Instructions:${NC}"
echo -e "   1. Open ${PURPLE}http://localhost:3000${NC}"
echo -e "   2. Click '${GREEN}Start${NC}' button"
echo -e "   3. Allow microphone access"
echo -e "   4. Speak numbers: ${YELLOW}'five'${NC}, ${YELLOW}'twenty'${NC}, ${YELLOW}'forty-two'${NC}"
echo ""
echo -e "${BLUE}📊 Monitor Logs:${NC}"
echo -e "   Backend: ${YELLOW}tail -f backend.log${NC}"
echo -e "   Frontend: ${YELLOW}tail -f frontend.log${NC}"
echo ""
echo -e "${BLUE}🔍 Expected Backend Logs:${NC}"
echo -e "   📤 PCM16 chunks for Deepgram"
echo -e "   📹 WebM chunks for Groq"
echo -e "   📝 Transcription results"
echo ""
echo -e "${RED}Press Ctrl+C to stop all services${NC}"
echo ""
echo -e "${PURPLE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Live Backend Logs:${NC}"
echo -e "${PURPLE}═══════════════════════════════════════${NC}"

# Show live logs
tail -f backend.log | grep -E "(📤|📹|📝|🎵|📨|🔊|✅|❌|⚠️|🎯|🚀)"