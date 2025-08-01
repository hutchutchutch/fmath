#!/bin/bash

# Quick development start script
# This is a simplified version for when you just want to start coding

echo "🚀 FastMath Dev Mode"
echo "==================="
echo ""

# Kill existing processes
echo "Clearing ports..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 1

# Check .env
if [ ! -f "backend/.env" ]; then
    echo "❌ backend/.env not found!"
    echo "Run ./start-all.sh for initial setup"
    exit 1
fi

# Start backend
echo "Starting backend..."
cd backend
npm run dev &
cd ..

# Start frontend
echo "Starting frontend..."
cd frontend
BROWSER=none npm start &
cd ..

echo ""
echo "Services starting..."
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Wait for interrupt
wait