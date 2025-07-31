#!/bin/bash

echo "🚀 Launching FastMath in Test Mode..."
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Kill any existing processes on ports 3000 and 3001
echo "Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null

# Function to check if a port is open
wait_for_port() {
    local port=$1
    local max_attempts=30
    local attempt=1
    
    while ! nc -z localhost $port 2>/dev/null; do
        if [ $attempt -eq $max_attempts ]; then
            echo -e "${RED}✗ Failed to start service on port $port${NC}"
            return 1
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    echo ""
    return 0
}

# Check if running on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - use Terminal.app
    
    # Start backend in new terminal
    echo -e "${BLUE}Starting backend test server in new terminal...${NC}"
    osascript -e "
    tell application \"Terminal\"
        do script \"cd '$SCRIPT_DIR/fastmath-backend' && echo '🔵 Backend Server' && echo '===============' && npm run test:server\"
        activate
    end tell"
    
    # Wait for backend to start
    echo -n "Waiting for backend to start"
    if wait_for_port 3000; then
        echo -e "${GREEN}✓ Backend started on http://localhost:3000${NC}"
    else
        echo -e "${RED}Failed to start backend. Please check the backend terminal for errors.${NC}"
        exit 1
    fi
    
    # Start frontend in new terminal
    echo -e "${BLUE}Starting frontend in new terminal...${NC}"
    osascript -e "
    tell application \"Terminal\"
        do script \"cd '$SCRIPT_DIR/fastmath' && echo '🟢 Frontend Server' && echo '=================' && export REACT_APP_TEST_MODE=true && export REACT_APP_API_URL=http://localhost:3000 && npm start\"
        activate
    end tell"
    
    # Wait a moment for frontend to initialize
    sleep 3
    
elif command -v gnome-terminal &> /dev/null; then
    # Linux with GNOME Terminal
    
    echo -e "${BLUE}Starting backend test server in new terminal...${NC}"
    gnome-terminal --title="FastMath Backend" -- bash -c "cd '$SCRIPT_DIR/fastmath-backend' && echo '🔵 Backend Server' && echo '===============' && npm run test:server; exec bash"
    
    echo -n "Waiting for backend to start"
    if wait_for_port 3000; then
        echo -e "${GREEN}✓ Backend started on http://localhost:3000${NC}"
    else
        echo -e "${RED}Failed to start backend. Please check the backend terminal for errors.${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Starting frontend in new terminal...${NC}"
    gnome-terminal --title="FastMath Frontend" -- bash -c "cd '$SCRIPT_DIR/fastmath' && echo '🟢 Frontend Server' && echo '=================' && export REACT_APP_TEST_MODE=true && export REACT_APP_API_URL=http://localhost:3000 && npm start; exec bash"
    
elif command -v xterm &> /dev/null; then
    # Linux with xterm
    
    echo -e "${BLUE}Starting backend test server in new terminal...${NC}"
    xterm -title "FastMath Backend" -e "cd '$SCRIPT_DIR/fastmath-backend' && echo '🔵 Backend Server' && echo '===============' && npm run test:server; bash" &
    
    echo -n "Waiting for backend to start"
    if wait_for_port 3000; then
        echo -e "${GREEN}✓ Backend started on http://localhost:3000${NC}"
    else
        echo -e "${RED}Failed to start backend. Please check the backend terminal for errors.${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Starting frontend in new terminal...${NC}"
    xterm -title "FastMath Frontend" -e "cd '$SCRIPT_DIR/fastmath' && echo '🟢 Frontend Server' && echo '=================' && export REACT_APP_TEST_MODE=true && export REACT_APP_API_URL=http://localhost:3000 && npm start; bash" &
    
else
    # Fallback - try to use the default terminal
    echo -e "${YELLOW}Could not detect terminal application. Trying generic approach...${NC}"
    
    # Start backend in background
    cd "$SCRIPT_DIR/fastmath-backend"
    npm run test:server &
    BACKEND_PID=$!
    
    echo -n "Waiting for backend to start"
    if wait_for_port 3000; then
        echo -e "${GREEN}✓ Backend started on http://localhost:3000${NC}"
    else
        echo -e "${RED}Failed to start backend.${NC}"
        exit 1
    fi
    
    # Start frontend
    cd "$SCRIPT_DIR/fastmath"
    export REACT_APP_TEST_MODE=true
    export REACT_APP_API_URL=http://localhost:3000
    npm start &
    FRONTEND_PID=$!
fi

echo ""
echo -e "${YELLOW}=================================="
echo "Test Mode is now running!"
echo "=================================="
echo ""
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:3001"
echo ""
echo "Test Credentials:"
echo "Email: test@example.com"
echo "Password: (any password will work)"
echo ""
echo "To stop the servers:"
echo "- Close the terminal windows, or"
echo "- Press Ctrl+C in each terminal${NC}"
echo ""

# If running on macOS, offer to open the browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${BLUE}Press Enter to open http://localhost:3001 in your browser, or Ctrl+C to skip...${NC}"
    read -n 1 -s
    open http://localhost:3001
fi