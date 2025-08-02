#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${2}${1}${NC}"
}

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Function to wait for server to start
wait_for_server() {
    local port=$1
    local name=$2
    local max_attempts=30
    local attempt=0
    
    print_status "⏳ Waiting for $name to start on port $port..." "$YELLOW"
    
    while [ $attempt -lt $max_attempts ]; do
        if check_port $port; then
            print_status "✅ $name is running on port $port" "$GREEN"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
        echo -n "."
    done
    
    echo ""
    print_status "❌ $name failed to start on port $port" "$RED"
    return 1
}

# Function to kill process on port
kill_port() {
    local port=$1
    if check_port $port; then
        print_status "🔄 Killing existing process on port $port" "$YELLOW"
        lsof -ti:$port | xargs kill -9 2>/dev/null
        sleep 2
    fi
}

print_status "🚀 Starting FastMath Speech Test Application" "$GREEN"
echo ""

# Check if we're in the right directory
if [ ! -f "backend/package.json" ] || [ ! -f "frontend/package.json" ]; then
    print_status "❌ Error: Must run this script from the fastmath-speech directory" "$RED"
    exit 1
fi

# Kill any existing processes on our ports
kill_port 3001
kill_port 3000
kill_port 8080

# Save the root directory
ROOT_DIR=$(pwd)

# Backend setup
print_status "📦 Setting up Backend..." "$YELLOW"
cd "$ROOT_DIR/backend"

# Check if node_modules exists, if not run npm install
if [ ! -d "node_modules" ]; then
    print_status "📥 Installing backend dependencies..." "$YELLOW"
    npm install
    if [ $? -ne 0 ]; then
        print_status "❌ Backend npm install failed" "$RED"
        exit 1
    fi
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    print_status "📝 Creating .env file from .env.example" "$YELLOW"
    cp .env.example .env
fi

# Start backend
print_status "🚀 Starting Backend Server..." "$GREEN"
npm run dev > backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
if wait_for_server 3001 "Backend"; then
    print_status "✅ Backend is ready!" "$GREEN"
    
    # Check if Deepgram simulator is enabled
    if grep -q "USE_DEEPGRAM_SIMULATOR=true" .env; then
        if wait_for_server 8080 "Deepgram Simulator"; then
            print_status "✅ Deepgram Simulator is ready!" "$GREEN"
        fi
    fi
else
    print_status "❌ Backend failed to start. Check backend.log for details" "$RED"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

# Frontend setup
cd "$ROOT_DIR/frontend"
print_status "" "$NC"
print_status "📦 Setting up Frontend..." "$YELLOW"

# Check if node_modules exists, if not run npm install
if [ ! -d "node_modules" ]; then
    print_status "📥 Installing frontend dependencies..." "$YELLOW"
    npm install
    if [ $? -ne 0 ]; then
        print_status "❌ Frontend npm install failed" "$RED"
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi
fi

# Start frontend
print_status "🚀 Starting Frontend Server..." "$GREEN"
npm start > frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start
if wait_for_server 3000 "Frontend"; then
    print_status "✅ Frontend is ready!" "$GREEN"
else
    print_status "❌ Frontend failed to start. Check frontend.log for details" "$RED"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 1
fi

print_status "" "$NC"
print_status "🎉 FastMath Speech Test Application is running!" "$GREEN"
print_status "" "$NC"
print_status "📍 Frontend: http://localhost:3000" "$GREEN"
print_status "📍 Backend:  http://localhost:3001" "$GREEN"
if grep -q "USE_DEEPGRAM_SIMULATOR=true" "$ROOT_DIR/backend/.env" 2>/dev/null; then
    print_status "📍 Deepgram Simulator: ws://localhost:8080" "$GREEN"
fi
print_status "" "$NC"
print_status "📝 Logs:" "$YELLOW"
print_status "   Backend:  $ROOT_DIR/backend/backend.log" "$NC"
print_status "   Frontend: $ROOT_DIR/frontend/frontend.log" "$NC"
print_status "" "$NC"
print_status "🛑 Press Ctrl+C to stop all servers" "$YELLOW"

# Function to cleanup on exit
cleanup() {
    echo ""
    print_status "🛑 Shutting down servers..." "$YELLOW"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    kill_port 3001
    kill_port 3000
    kill_port 8080
    print_status "✅ All servers stopped" "$GREEN"
    exit 0
}

# Set up trap to cleanup on Ctrl+C
trap cleanup INT

# Keep script running
while true; do
    sleep 1
    
    # Check if processes are still running
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        print_status "❌ Backend process died unexpectedly" "$RED"
        cleanup
    fi
    
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        print_status "❌ Frontend process died unexpectedly" "$RED"
        cleanup
    fi
done