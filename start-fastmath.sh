#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}╔════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║    FastMath with Voice Input System    ║${NC}"
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

# Environment check for backend
echo -e "${BLUE}🔐 Backend Environment Configuration${NC}"
echo -e "${BLUE}═══════════════════════════════════${NC}"

BACKEND_ENV="fastmath-backend/.env"
if [ ! -f "$BACKEND_ENV" ]; then
    echo -e "  ${RED}✗ Backend .env not found${NC}"
    echo ""
    echo -e "${YELLOW}Creating backend .env template...${NC}"
    cat > "$BACKEND_ENV" << EOF
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
AWS_REGION=us-east-1
DYNAMODB_TABLE_PREFIX=fastmath-

# Authentication
JWT_SECRET=your_jwt_secret_here

# LiveKit Configuration (for Voice Input)
LIVEKIT_URL=wss://your-instance.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# Deepgram Configuration (for Voice Transcription)
DEEPGRAM_API_KEY=your_deepgram_api_key
EOF
    echo -e "${GREEN}✓ Created backend .env template${NC}"
    echo ""
    echo -e "${YELLOW}Please edit fastmath-backend/.env and add your configuration${NC}"
    exit 1
fi

# Check backend API keys
MISSING_KEYS=false
echo -e "  ${YELLOW}→ Checking backend API keys...${NC}"

if grep -q "DEEPGRAM_API_KEY=your_deepgram_api_key" "$BACKEND_ENV" || ! grep -q "DEEPGRAM_API_KEY=.." "$BACKEND_ENV"; then
    echo -e "  ${YELLOW}⚠ DEEPGRAM_API_KEY not configured (voice input will be disabled)${NC}"
else
    echo -e "  ${GREEN}✓ DEEPGRAM_API_KEY configured${NC}"
fi

if grep -q "LIVEKIT_API_KEY=your_livekit_api_key" "$BACKEND_ENV" || ! grep -q "LIVEKIT_API_KEY=.." "$BACKEND_ENV"; then
    echo -e "  ${YELLOW}⚠ LIVEKIT_API_KEY not configured (voice input will be disabled)${NC}"
else
    echo -e "  ${GREEN}✓ LIVEKIT_API_KEY configured${NC}"
fi

echo ""

# Environment check for frontend
echo -e "${BLUE}🔐 Frontend Environment Configuration${NC}"
echo -e "${BLUE}═══════════════════════════════════${NC}"

FRONTEND_ENV="fastmath/.env"
if [ ! -f "$FRONTEND_ENV" ]; then
    echo -e "  ${YELLOW}→ Creating frontend .env...${NC}"
    cat > "$FRONTEND_ENV" << EOF
# API Configuration
REACT_APP_API_URL=http://localhost:3000

# Voice Input Configuration
REACT_APP_ENABLE_DEEPGRAM=true
EOF
    echo -e "  ${GREEN}✓ Created frontend .env${NC}"
else
    echo -e "  ${GREEN}✓ Frontend .env exists${NC}"
fi

# Check if Deepgram is enabled
if grep -q "REACT_APP_ENABLE_DEEPGRAM=true" "$FRONTEND_ENV"; then
    echo -e "  ${GREEN}✓ Deepgram voice input enabled${NC}"
else
    echo -e "  ${YELLOW}⚠ Deepgram voice input disabled (using Web Speech API)${NC}"
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
cd fastmath-backend
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo -e "  ${YELLOW}→ Installing...${NC}"
    npm install --silent
    echo -e "  ${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "  ${GREEN}✓ Backend dependencies up to date${NC}"
fi

# Build TypeScript if needed
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
    echo -e "  ${YELLOW}→ Building TypeScript...${NC}"
    npm run build
    echo -e "  ${GREEN}✓ Backend built${NC}"
else
    echo -e "  ${GREEN}✓ Backend build up to date${NC}"
fi
cd ..

# Frontend dependencies
echo -e "${YELLOW}Frontend dependencies:${NC}"
cd fastmath
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
cd fastmath-backend
npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

if wait_for_service 3000 "Backend"; then
    # Quick health check
    if curl -s http://localhost:3000/health | grep -q "ok" 2>/dev/null; then
        echo -e "  ${GREEN}✓ API health check passed${NC}"
    else
        echo -e "  ${YELLOW}⚠ API health check failed${NC}"
    fi
else
    echo -e "${RED}Backend failed to start. Recent logs:${NC}"
    tail -20 backend.log
    exit 1
fi

# Start frontend
echo -e "${YELLOW}Frontend service:${NC}"
cd fastmath
export BROWSER=none
PORT=3001 npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

if wait_for_service 3001 "Frontend"; then
    echo -e "  ${GREEN}✓ React app ready${NC}"
else
    echo -e "${RED}Frontend failed to start. Recent logs:${NC}"
    tail -20 frontend.log
    exit 1
fi

echo ""

# Check voice input status
VOICE_STATUS="disabled"
if grep -q "REACT_APP_ENABLE_DEEPGRAM=true" "$FRONTEND_ENV" && \
   grep -q "DEEPGRAM_API_KEY=.." "$BACKEND_ENV" && \
   ! grep -q "DEEPGRAM_API_KEY=your_deepgram_api_key" "$BACKEND_ENV" && \
   grep -q "LIVEKIT_API_KEY=.." "$BACKEND_ENV" && \
   ! grep -q "LIVEKIT_API_KEY=your_livekit_api_key" "$BACKEND_ENV"; then
    VOICE_STATUS="enabled"
fi

# Success message
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        🎉 FastMath Ready! 🎉           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📍 URLs:${NC}"
echo -e "   Frontend: ${PURPLE}http://localhost:3001${NC}"
echo -e "   Backend:  ${PURPLE}http://localhost:3000${NC}"
echo ""
echo -e "${BLUE}🎤 Voice Input Status:${NC}"
if [ "$VOICE_STATUS" = "enabled" ]; then
    echo -e "   ${GREEN}✓ Deepgram/LiveKit voice input enabled${NC}"
    echo -e "   ${YELLOW}→ Low-latency voice transcription active${NC}"
else
    echo -e "   ${YELLOW}⚠ Using Web Speech API fallback${NC}"
    echo -e "   ${YELLOW}→ Configure Deepgram/LiveKit in backend .env for enhanced voice input${NC}"
fi
echo ""
echo -e "${BLUE}🚀 Getting Started:${NC}"
echo -e "   1. Open ${PURPLE}http://localhost:3001${NC}"
echo -e "   2. Log in or create an account"
echo -e "   3. Navigate to any practice mode"
if [ "$VOICE_STATUS" = "enabled" ]; then
    echo -e "   4. Voice input will start automatically"
    echo -e "   5. Speak your answers clearly"
    echo -e "   6. Watch the audio level meter for feedback"
else
    echo -e "   4. Use keyboard or Web Speech API for input"
fi
echo ""
echo -e "${BLUE}📊 Monitor Logs:${NC}"
echo -e "   Backend:  ${YELLOW}tail -f backend.log${NC}"
echo -e "   Frontend: ${YELLOW}tail -f frontend.log${NC}"
echo ""
if [ "$VOICE_STATUS" = "enabled" ]; then
    echo -e "${BLUE}🔍 Voice Input Logs to Watch:${NC}"
    echo -e "   [VoiceService] Created voice session"
    echo -e "   [AudioHandler] Connected to room"
    echo -e "   [DeepgramService] Connection opened"
    echo -e "   [AudioHandler] Audio track subscribed"
    echo -e "   [DeepgramService] Transcription received"
    echo ""
fi
echo -e "${RED}Press Ctrl+C to stop all services${NC}"
echo ""
echo -e "${PURPLE}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Live Backend Logs:${NC}"
echo -e "${PURPLE}═══════════════════════════════════════${NC}"

# Show live logs
if [ "$VOICE_STATUS" = "enabled" ]; then
    # Show voice-related logs
    tail -f backend.log | grep -E "(VoiceService|AudioHandler|DeepgramService|LivekitService|Voice Routes|health|Server running)"
else
    # Show general logs
    tail -f backend.log | grep -E "(Server running|health|Error|Warning)"
fi