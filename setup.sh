#!/bin/bash
# NeuralMind AI Agent — One-command setup script
set -e

echo ""
echo "🧠 NeuralMind AI Agent — Setup"
echo "================================"

# ---- Backend ----
echo ""
echo "📦 Setting up backend..."
cd backend

if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo "  ✓ Virtual environment created"
fi

source venv/bin/activate
pip install -r requirements.txt --quiet
echo "  ✓ Python dependencies installed"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "  ⚠️  IMPORTANT: Edit backend/.env and add your GEMINI_API_KEY"
  echo "     Get a free key at: https://aistudio.google.com"
fi

cd ..

# ---- Frontend ----
echo ""
echo "📦 Setting up frontend..."
cd frontend
npm install --silent
echo "  ✓ Node dependencies installed"
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the app:"
echo "  1. Add your GEMINI_API_KEY to backend/.env"
echo "  2. Terminal 1:  cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000"
echo "  3. Terminal 2:  cd frontend && npm run dev"
echo "  4. Open:        http://localhost:5173"
echo ""
