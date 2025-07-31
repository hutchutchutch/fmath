#!/bin/bash

echo "🚀 Launching FastMath in Test Mode (with dependency checks)..."
echo "============================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Function to check and install dependencies
check_dependencies() {
    local dir=$1
    local name=$2
    
    echo -e "${BLUE}Checking $name dependencies...${NC}"
    cd "$dir"
    
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing $name dependencies...${NC}"
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to install $name dependencies${NC}"
            return 1
        fi
    else
        echo -e "${GREEN}✓ $name dependencies already installed${NC}"
    fi
    return 0
}

# Kill any existing processes on ports 3000 and 3001
echo "Cleaning up existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 1

# Check backend dependencies
if ! check_dependencies "$SCRIPT_DIR/fastmath-backend" "backend"; then
    exit 1
fi

# Check frontend dependencies
if ! check_dependencies "$SCRIPT_DIR/fastmath" "frontend"; then
    exit 1
fi

echo ""
echo -e "${GREEN}All dependencies installed!${NC}"
echo ""

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
        activate
        set backendWindow to do script \"cd '$SCRIPT_DIR/fastmath-backend' && clear && echo '🔵 Backend Server' && echo '===============' && echo '' && npm run test:server\"
        set current settings of backendWindow to settings set \"Pro\"
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
        set frontendWindow to do script \"cd '$SCRIPT_DIR/fastmath' && clear && echo '🟢 Frontend Server' && echo '=================' && echo '' && export REACT_APP_TEST_MODE=true && export REACT_APP_API_URL=http://localhost:3000 && npm start\"
        set current settings of frontendWindow to settings set \"Pro\"
    end tell"
    
    # Wait for frontend to start
    echo -n "Waiting for frontend to start"
    sleep 5  # Give React time to compile
    
else
    # Linux/Other - fallback to background processes
    echo -e "${YELLOW}Note: On Linux, servers will run in background. Use 'ps aux | grep node' to find processes.${NC}"
    
    # Start backend
    echo -e "${BLUE}Starting backend test server...${NC}"
    cd "$SCRIPT_DIR/fastmath-backend"
    npm run test:server > backend.log 2>&1 &
    BACKEND_PID=$!
    
    echo -n "Waiting for backend to start"
    if wait_for_port 3000; then
        echo -e "${GREEN}✓ Backend started on http://localhost:3000 (PID: $BACKEND_PID)${NC}"
    else
        echo -e "${RED}Failed to start backend. Check backend.log for errors.${NC}"
        exit 1
    fi
    
    # Start frontend
    echo -e "${BLUE}Starting frontend...${NC}"
    cd "$SCRIPT_DIR/fastmath"
    export REACT_APP_TEST_MODE=true
    export REACT_APP_API_URL=http://localhost:3000
    npm start > frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo -e "${GREEN}✓ Frontend starting on http://localhost:3001 (PID: $FRONTEND_PID)${NC}"
    echo -e "${YELLOW}Check frontend.log for status${NC}"
fi

echo ""
echo -e "${GREEN}=================================="
echo "✨ Test Mode is now running!"
echo "==================================${NC}"
echo ""
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:3001"
echo ""
echo -e "${YELLOW}Test Credentials:"
echo "Email: test@example.com"
echo "Password: (any password will work)${NC}"
echo ""

if [[ "$OSTYPE" != "darwin"* ]] && [ ! -z "$BACKEND_PID" ]; then
    echo -e "${BLUE}To stop the servers:${NC}"
    echo "kill $BACKEND_PID $FRONTEND_PID"
    echo ""
    
    # Create a stop script
    echo "#!/bin/bash" > "$SCRIPT_DIR/stop-test-mode.sh"
    echo "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" >> "$SCRIPT_DIR/stop-test-mode.sh"
    echo "echo 'Test servers stopped'" >> "$SCRIPT_DIR/stop-test-mode.sh"
    chmod +x "$SCRIPT_DIR/stop-test-mode.sh"
    echo -e "${GREEN}Created stop-test-mode.sh to stop servers${NC}"
fi

# If running on macOS, wait a bit then offer to open the browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ""
    echo -e "${BLUE}Waiting for frontend to compile...${NC}"
    sleep 8
    echo -e "${GREEN}Opening http://localhost:3001 in your browser...${NC}"
    open http://localhost:3001
fi

echo ""
echo -e "${GREEN}Test mode setup complete! Check the terminal windows for server output.${NC}"