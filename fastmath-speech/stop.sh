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

# Function to kill process on port
kill_port() {
    local port=$1
    local name=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        print_status "🛑 Stopping $name on port $port" "$YELLOW"
        lsof -ti:$port | xargs kill -9 2>/dev/null
        sleep 1
    else
        print_status "ℹ️  No process found on port $port" "$NC"
    fi
}

print_status "🛑 Stopping FastMath Speech Test Application" "$YELLOW"
echo ""

# Kill all processes
kill_port 3001 "Backend"
kill_port 3000 "Frontend"
kill_port 8080 "Deepgram Simulator"

echo ""
print_status "✅ All servers stopped" "$GREEN"