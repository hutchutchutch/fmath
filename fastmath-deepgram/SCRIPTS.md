# FastMath LiveKit Scripts Guide

## Quick Start

```bash
# First time setup and run
./start-all.sh

# Quick development start (after initial setup)
./dev.sh
```

## Available Scripts

### 🚀 `start-all.sh` - Complete System Start
**Use this for:** First time setup or when you want a clean start
- Checks and kills existing processes on ports 3000 & 3001
- Verifies environment configuration
- Installs/updates dependencies
- Starts both frontend and backend
- Shows live backend logs
- Provides comprehensive status updates

### ⚡ `dev.sh` - Quick Development Start
**Use this for:** Daily development when everything is already set up
- Kills existing processes
- Starts frontend and backend quickly
- Minimal output for clean console

### 🧪 `test-livekit-react.sh` - Full Integration Test
**Use this for:** Testing the complete LiveKit integration
- Comprehensive port management
- Dependency checking
- Service health verification
- Detailed colored output
- Endpoint testing

### 🔍 `test-backend.sh` - Backend API Test
**Use this for:** Quick backend endpoint verification
```bash
./test-backend.sh
```
Tests:
- Exercise session endpoint
- Audio stream status
- LiveKit configuration

### 📋 `check-env.sh` - Environment Verification
**Use this for:** Checking if API keys are configured
```bash
./check-env.sh
```
Verifies:
- backend/.env exists
- Required API keys are set
- Optional LiveKit configuration

### 🎤 `test-audio-flow.sh` - Audio Debug Guide
**Use this for:** Understanding the audio processing flow
```bash
./test-audio-flow.sh
```
Shows:
- Expected log sequence
- Common issues and solutions
- Audio flow diagram

### 🐛 `test-audio-debug.sh` - Audio Debugging Helper
**Use this for:** Detailed audio debugging instructions
```bash
./test-audio-debug.sh
```

## Port Management

All scripts automatically handle port conflicts:
- Port 3000: Frontend (React)
- Port 3001: Backend (Express)

If you see "address already in use" errors, the scripts will:
1. Find processes using the ports
2. Kill them automatically
3. Start fresh instances

## Manual Port Cleanup

If needed, you can manually clear ports:
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Kill all node processes
pkill -f node
```

## Logs

The scripts create log files:
- `backend.log` - Backend server logs
- `frontend.log` - Frontend build/serve logs

Monitor logs in real-time:
```bash
# Backend logs
tail -f backend.log

# Frontend logs
tail -f frontend.log

# Both logs
tail -f backend.log frontend.log
```

## Troubleshooting

### "Loading session..." stuck
1. Check if backend is running: `curl http://localhost:3001/api/exercise/session/new`
2. Check backend logs: `tail -f backend.log`
3. Verify API keys in `backend/.env`

### No audio from Deepgram/Groq
1. Check browser console for WebSocket errors
2. Verify you see "📤 PCM16 chunk" messages in backend
3. Check API keys are valid

### Scripts hang or don't exit cleanly
1. Press `Ctrl+C` to trigger cleanup
2. If that fails, use `Ctrl+Z` then `kill %1`
3. Manually clear ports if needed

## Development Workflow

1. **Initial Setup**
   ```bash
   ./start-all.sh
   ```

2. **Daily Development**
   ```bash
   ./dev.sh
   ```

3. **Testing Changes**
   - Make your code changes
   - Services auto-reload (backend with nodemon, frontend with webpack)
   - No need to restart unless you change dependencies

4. **Debugging Audio**
   ```bash
   # In one terminal
   tail -f backend.log | grep -E "(📤|📹|📝)"
   
   # Test the app and watch for audio logs
   ```

5. **Clean Restart**
   ```bash
   # Ctrl+C to stop current services
   ./start-all.sh  # For full restart with checks
   ```