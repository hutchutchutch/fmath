#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Testing LiveKit Audio Pipeline ===${NC}"
echo ""

# Check if backend is running
echo -e "${YELLOW}Checking backend status...${NC}"
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo -e "${RED}❌ Backend is not running. Start it with: cd backend && npm run dev${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Backend is running${NC}"

# Check LiveKit configuration
echo ""
echo -e "${YELLOW}Checking LiveKit configuration...${NC}"
LIVEKIT_STATUS=$(curl -s http://localhost:3001/api/livekit/test)
if [[ $(echo $LIVEKIT_STATUS | jq -r '.configured') != "true" ]]; then
    echo -e "${RED}❌ LiveKit is not configured${NC}"
    exit 1
fi
echo -e "${GREEN}✅ LiveKit is configured${NC}"

# Check Groq configuration
echo ""
echo -e "${YELLOW}Checking Groq configuration...${NC}"
GROQ_STATUS=$(curl -s http://localhost:3001/api/groq/test)
if [[ $(echo $GROQ_STATUS | jq -r '.configured') != "true" ]]; then
    echo -e "${RED}❌ Groq is not configured${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Groq is configured${NC}"

# Check audio routing status
echo ""
echo -e "${YELLOW}Checking audio routing status...${NC}"
ROUTING_STATUS=$(curl -s http://localhost:3001/api/livekit/status)
echo "Current status:"
echo $ROUTING_STATUS | jq '.'

# Test joining a room
echo ""
echo -e "${YELLOW}Testing room join...${NC}"
ROOM_NAME="test-room-$(date +%s)"
JOIN_RESULT=$(curl -s -X POST http://localhost:3001/api/livekit/join-room \
  -H "Content-Type: application/json" \
  -d "{\"roomName\": \"$ROOM_NAME\"}")

if [[ $(echo $JOIN_RESULT | jq -r '.success') == "true" ]]; then
    echo -e "${GREEN}✅ Successfully joined room: $ROOM_NAME${NC}"
    echo "Services status:"
    echo $JOIN_RESULT | jq '.services'
else
    echo -e "${RED}❌ Failed to join room${NC}"
    echo $JOIN_RESULT | jq '.'
    exit 1
fi

# Monitor transcriptions
echo ""
echo -e "${BLUE}Monitoring transcriptions (press Ctrl+C to stop)...${NC}"
echo -e "${YELLOW}Join the room '$ROOM_NAME' from the frontend to test audio routing${NC}"
echo ""

# Connect to SSE endpoint for transcriptions
curl -s -N http://localhost:3001/api/livekit/transcriptions | while read -r line; do
    if [[ $line == data:* ]]; then
        # Extract JSON from SSE data
        json=${line#data: }
        if [[ ! -z "$json" && "$json" != " " ]]; then
            echo $json | jq '.'
        fi
    fi
done

# Cleanup (this won't run due to the continuous curl, but included for completeness)
echo ""
echo -e "${YELLOW}Leaving room...${NC}"
curl -s -X POST http://localhost:3001/api/livekit/leave-room \
  -H "Content-Type: application/json" \
  -d "{\"roomName\": \"$ROOM_NAME\"}" | jq '.'