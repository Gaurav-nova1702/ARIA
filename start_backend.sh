#!/bin/bash
cd "$(dirname "$0")/backend"
source venv/bin/activate
echo "🚀 Starting NeuralMind backend at http://localhost:8000"
echo "   API docs: http://localhost:8000/docs"
uvicorn main:app --reload --port 8000
