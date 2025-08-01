#!/bin/bash

echo "🔍 Checking Environment Configuration"
echo "===================================="
echo ""

# Check backend .env file
if [ -f "backend/.env" ]; then
    echo "✅ backend/.env file exists"
    
    # Check for required API keys
    if grep -q "DEEPGRAM_API_KEY=" backend/.env; then
        echo "✅ DEEPGRAM_API_KEY is set"
    else
        echo "❌ DEEPGRAM_API_KEY is missing in backend/.env"
    fi
    
    if grep -q "GROQ_API_KEY=" backend/.env; then
        echo "✅ GROQ_API_KEY is set"
    else
        echo "❌ GROQ_API_KEY is missing in backend/.env"
    fi
    
    if grep -q "LIVEKIT_API_KEY=" backend/.env; then
        echo "✅ LIVEKIT_API_KEY is set"
    else
        echo "⚠️  LIVEKIT_API_KEY is missing (optional for this setup)"
    fi
    
    if grep -q "LIVEKIT_API_SECRET=" backend/.env; then
        echo "✅ LIVEKIT_API_SECRET is set"
    else
        echo "⚠️  LIVEKIT_API_SECRET is missing (optional for this setup)"
    fi
else
    echo "❌ backend/.env file not found"
    echo ""
    echo "Create backend/.env with:"
    echo "DEEPGRAM_API_KEY=your_deepgram_key"
    echo "GROQ_API_KEY=your_groq_key"
fi

echo ""
echo "To get API keys:"
echo "- Deepgram: https://console.deepgram.com/"
echo "- Groq: https://console.groq.com/keys"