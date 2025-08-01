#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Complete LiveKit Audio Pipeline Test ===${NC}"
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please ensure your .env file has:"
    echo "  LIVEKIT_API_KEY=your_key"
    echo "  LIVEKIT_API_SECRET=your_secret"
    echo "  LIVEKIT_URL=wss://your-server.livekit.cloud"
    echo "  DEEPGRAM_API_KEY=your_key"
    echo "  GROQ_API_KEY=your_key"
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    
    # Leave room if we joined one
    if [ ! -z "$ROOM_NAME" ]; then
        echo "Leaving room $ROOM_NAME..."
        curl -s -X POST http://localhost:3001/api/livekit/leave-room \
          -H "Content-Type: application/json" \
          -d "{\"roomName\": \"$ROOM_NAME\"}" > /dev/null 2>&1
    fi
    
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
    
    # Clean up log files
    rm -f backend_pipeline_test.log frontend_pipeline_test.log
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check if backend is already running
echo -e "${YELLOW}Checking if backend is already running...${NC}"
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is already running${NC}"
    BACKEND_ALREADY_RUNNING=true
else
    # Start backend
    echo -e "${YELLOW}Starting backend...${NC}"
    cd backend
    npm run dev > ../backend_pipeline_test.log 2>&1 &
    BACKEND_PID=$!
    cd ..
    
    # Wait for backend to start
    echo "Waiting for backend to start..."
    for i in {1..30}; do
        if curl -s http://localhost:3001/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Backend is running${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}❌ Backend failed to start${NC}"
            echo "Check backend_pipeline_test.log for errors:"
            tail -20 backend_pipeline_test.log
            exit 1
        fi
        sleep 1
    done
fi

# Check LiveKit configuration
echo ""
echo -e "${YELLOW}Checking LiveKit configuration...${NC}"
LIVEKIT_STATUS=$(curl -s http://localhost:3001/api/livekit/test)
if [[ $(echo $LIVEKIT_STATUS | grep -o '"configured":true') ]]; then
    echo -e "${GREEN}✅ LiveKit is configured${NC}"
    echo "  URL: $(echo $LIVEKIT_STATUS | grep -o '"url":"[^"]*"' | cut -d'"' -f4)"
else
    echo -e "${RED}❌ LiveKit is not configured${NC}"
    echo "Response: $LIVEKIT_STATUS"
    exit 1
fi

# Check Groq configuration
echo ""
echo -e "${YELLOW}Checking Groq configuration...${NC}"
GROQ_STATUS=$(curl -s http://localhost:3001/api/groq/test)
if [[ $(echo $GROQ_STATUS | grep -o '"configured":true') ]]; then
    echo -e "${GREEN}✅ Groq is configured${NC}"
else
    echo -e "${RED}❌ Groq is not configured${NC}"
    echo "Response: $GROQ_STATUS"
    exit 1
fi

# Check Deepgram configuration
echo ""
echo -e "${YELLOW}Checking Deepgram configuration...${NC}"
if grep -q "DEEPGRAM_API_KEY=" .env && ! grep -q "DEEPGRAM_API_KEY=$" .env && ! grep -q "DEEPGRAM_API_KEY=\"\"" .env; then
    echo -e "${GREEN}✅ Deepgram API key found${NC}"
else
    echo -e "${YELLOW}⚠️  Deepgram API key not found (optional)${NC}"
fi

# Check audio routing status
echo ""
echo -e "${YELLOW}Checking audio routing status...${NC}"
ROUTING_STATUS=$(curl -s http://localhost:3001/api/livekit/status)
echo "Current routing status:"
echo $ROUTING_STATUS | python3 -m json.tool 2>/dev/null || echo $ROUTING_STATUS

# Test joining a room
echo ""
echo -e "${YELLOW}Testing room join...${NC}"
ROOM_NAME="test-audio-pipeline-$(date +%s)"
echo "Creating room: $ROOM_NAME"

JOIN_RESULT=$(curl -s -X POST http://localhost:3001/api/livekit/join-room \
  -H "Content-Type: application/json" \
  -d "{\"roomName\": \"$ROOM_NAME\"}")

if [[ $(echo $JOIN_RESULT | grep -o '"success":true') ]]; then
    echo -e "${GREEN}✅ Successfully joined room: $ROOM_NAME${NC}"
    echo "Services status:"
    echo $JOIN_RESULT | python3 -m json.tool 2>/dev/null || echo $JOIN_RESULT
else
    echo -e "${RED}❌ Failed to join room${NC}"
    echo "Error response:"
    echo $JOIN_RESULT | python3 -m json.tool 2>/dev/null || echo $JOIN_RESULT
    exit 1
fi

# Create a simple test page
echo ""
echo -e "${YELLOW}Creating test interface...${NC}"
cat > test-audio-page.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>LiveKit Audio Pipeline Test</title>
    <script src="https://unpkg.com/livekit-client/dist/livekit-client.umd.min.js"></script>
    <script>
        // Check what's available after loading LiveKit
        console.log('LiveKit globals:', {
            LiveKit: typeof LiveKit !== 'undefined',
            livekit: typeof livekit !== 'undefined',
            LiveKitClient: typeof LiveKitClient !== 'undefined',
            window_keys: Object.keys(window).filter(k => k.toLowerCase().includes('livekit'))
        });
    </script>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px;
        }
        .status { 
            padding: 10px; 
            margin: 10px 0; 
            border-radius: 5px; 
            background: #f0f0f0;
        }
        .connected { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        button { 
            padding: 10px 20px; 
            font-size: 16px; 
            margin: 10px 5px;
            cursor: pointer;
        }
        #transcriptions {
            border: 1px solid #ddd;
            padding: 10px;
            margin-top: 20px;
            height: 200px;
            overflow-y: auto;
            background: #f9f9f9;
        }
        .transcription {
            margin: 5px 0;
            padding: 5px;
            border-left: 3px solid #007bff;
        }
    </style>
</head>
<body>
    <h1>LiveKit Audio Pipeline Test</h1>
    
    <div id="status" class="status">Ready to connect</div>
    
    <div>
        <button onclick="getToken()">1. Get Token</button>
        <button onclick="connectToRoom()" disabled id="connectBtn">2. Connect to Room</button>
        <button onclick="startAudio()" disabled id="audioBtn">3. Start Audio</button>
        <button onclick="sayNumber()" disabled id="speakBtn">4. Say a Number</button>
    </div>
    
    <div>
        <h3>Instructions:</h3>
        <ol>
            <li>Click "Get Token" to authenticate</li>
            <li>Click "Connect to Room" to join the LiveKit room</li>
            <li>Click "Start Audio" to publish your microphone</li>
            <li>Click "Say a Number" or speak any number (0-20)</li>
            <li>Watch for transcriptions below</li>
        </ol>
    </div>
    
    <h3>Server Transcriptions:</h3>
    <div id="transcriptions"></div>
    
    <script>
        let room;
        let token;
        const roomName = new URLSearchParams(window.location.search).get('room');
        
        async function getToken() {
            try {
                updateStatus('Getting token...', 'status');
                const response = await fetch('http://localhost:3001/api/livekit/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        roomName: roomName,
                        participantName: 'test-user-' + Date.now()
                    })
                });
                
                const data = await response.json();
                if (data.token) {
                    token = data.token;
                    updateStatus('Token received! Ready to connect.', 'connected');
                    document.getElementById('connectBtn').disabled = false;
                    
                    // Start monitoring transcriptions
                    monitorTranscriptions();
                } else {
                    throw new Error('No token received');
                }
            } catch (error) {
                updateStatus('Error: ' + error.message, 'error');
            }
        }
        
        async function connectToRoom() {
            try {
                updateStatus('Connecting to room...', 'status');
                // Try different possible namespaces
                if (typeof livekit_client !== 'undefined') {
                    room = new livekit_client.Room();
                } else if (typeof LiveKit !== 'undefined') {
                    room = new LiveKit.Room();
                } else if (typeof livekit !== 'undefined') {
                    room = new livekit.Room();
                } else {
                    throw new Error('LiveKit library not loaded. Check console for available globals.');
                }
                
                room.on('connected', () => {
                    updateStatus('Connected to room!', 'connected');
                    document.getElementById('audioBtn').disabled = false;
                });
                
                room.on('disconnected', () => {
                    updateStatus('Disconnected from room', 'error');
                });
                
                const url = new URLSearchParams(window.location.search).get('url');
                await room.connect(url, token);
            } catch (error) {
                updateStatus('Connection error: ' + error.message, 'error');
            }
        }
        
        async function startAudio() {
            try {
                updateStatus('Starting audio...', 'status');
                // Use the same namespace detection
                const LK = typeof livekit_client !== 'undefined' ? livekit_client : 
                           typeof LiveKit !== 'undefined' ? LiveKit : 
                           typeof livekit !== 'undefined' ? livekit : null;
                
                if (!LK) {
                    throw new Error('LiveKit library not available');
                }
                
                const tracks = await LK.createLocalTracks({
                    audio: true,
                    video: false
                });
                
                await room.localParticipant.publishTracks(tracks);
                updateStatus('Audio published! Speak any number.', 'connected');
                document.getElementById('speakBtn').disabled = false;
            } catch (error) {
                updateStatus('Audio error: ' + error.message, 'error');
            }
        }
        
        function sayNumber() {
            const numbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
            const number = numbers[Math.floor(Math.random() * numbers.length)];
            
            const utterance = new SpeechSynthesisUtterance(number);
            window.speechSynthesis.speak(utterance);
            
            updateStatus('Said: ' + number, 'connected');
        }
        
        function updateStatus(message, className) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = 'status ' + className;
        }
        
        function monitorTranscriptions() {
            const eventSource = new EventSource('http://localhost:3001/api/livekit/transcriptions');
            
            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'transcription') {
                    addTranscription(data);
                }
            };
            
            eventSource.onerror = (error) => {
                console.error('SSE error:', error);
            };
        }
        
        function addTranscription(data) {
            const container = document.getElementById('transcriptions');
            const div = document.createElement('div');
            div.className = 'transcription';
            div.innerHTML = `
                <strong>${data.service.toUpperCase()}</strong>: 
                "${data.text}" 
                ${data.number !== null ? `→ ${data.number}` : '(no number)'} 
                <small>(${data.latency}ms)</small>
            `;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }
    </script>
</body>
</html>
EOF

# Get the LiveKit URL from the join result
LIVEKIT_URL=$(echo $LIVEKIT_STATUS | grep -o '"url":"[^"]*"' | cut -d'"' -f4)

# Open the test page in browser
echo ""
echo -e "${GREEN}=== Audio Pipeline Test Ready ===${NC}"
echo ""
echo -e "${BLUE}Test Page URL:${NC}"
echo "http://localhost:8080/test-audio-page.html?room=$ROOM_NAME&url=$LIVEKIT_URL"
echo ""
echo -e "${YELLOW}Starting local web server...${NC}"
echo ""
echo "Instructions:"
echo "1. Open the URL above in your browser"
echo "2. Follow the on-screen steps to test audio"
echo "3. Transcriptions will appear here and in the browser"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the test${NC}"
echo ""

# Start a simple HTTP server and monitor transcriptions
python3 -m http.server 8080 > /dev/null 2>&1 &
WEBSERVER_PID=$!

# Monitor transcriptions in terminal
echo -e "${BLUE}=== Monitoring Transcriptions ===${NC}"
curl -s -N http://localhost:3001/api/livekit/transcriptions | while read -r line; do
    if [[ $line == data:* ]]; then
        json=${line#data: }
        if [[ ! -z "$json" && "$json" != " " && "$json" != '{"type":"connected"}' ]]; then
            # Parse and format the JSON
            if command -v jq > /dev/null 2>&1; then
                echo $json | jq -r 'if .type == "transcription" then "[\(.service | ascii_upcase)] \"\(.text)\" → \(.number // "no number") (\(.latency)ms)" else empty end' 2>/dev/null
            else
                echo $json
            fi
        fi
    fi
done