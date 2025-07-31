#!/bin/bash

echo "🚀 Launching FastMath in Test Mode (Simplified)..."
echo "=================================="
echo ""

# Instructions
echo "Please run these commands in separate terminal windows:"
echo ""
echo "Terminal 1 (Backend):"
echo "cd fastmath-backend && npm run test:server"
echo ""
echo "Terminal 2 (Frontend):"
echo "cd fastmath && REACT_APP_TEST_MODE=true REACT_APP_API_URL=http://localhost:3000 npm start"
echo ""
echo "Once both are running:"
echo "- Frontend: http://localhost:3000 (or 3001)"
echo "- Backend: http://localhost:3000"
echo ""
echo "Test Credentials:"
echo "- Email: test@example.com"
echo "- Password: (any password will work)"