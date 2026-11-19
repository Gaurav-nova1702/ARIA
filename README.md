# 🧠 NeuralMind — Self-Learning AI Agent

A complete, modular, self-learning AI agent web application built as a final-year academic project. Features memory, voice interaction, web research, persistent knowledge base, and feedback-driven self-improvement.

---

## ✨ Features

| Feature | Implementation |
|---|---|
| 💬 Intelligent Chat | Google Gemini 1.5 Flash LLM |
| 🎙️ Voice Input/Output | Web Speech API (browser-native, free) |
| 🔍 Web Research | DuckDuckGo Search + BeautifulSoup |
| 🧠 Long-Term Memory | ChromaDB vector store (semantic search) |
| 📚 Knowledge Base | Auto-growing with source citations |
| 🔁 Self-Learning | Feedback engine with few-shot improvement |
| 📊 Metrics Dashboard | Recharts — trend, rating distribution |
| 📱 Fully Responsive | Mobile, tablet, desktop |

---

## 🏗️ Architecture

```
Frontend (React + Vite + Tailwind)
        ↕ REST + WebSocket
Backend (FastAPI + Python)
  ├── Agent Orchestrator   ← routes queries
  ├── Memory Manager       ← short + long term
  ├── Knowledge Base       ← ChromaDB + SQLite
  ├── Research Tool        ← DuckDuckGo + scraper
  └── Feedback Engine      ← self-improvement loop
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- A free **Google Gemini API key** from [aistudio.google.com](https://aistudio.google.com)

---

### 1. Clone / navigate to the project

```bash
cd /Users/gaurav_kadam/.gemini/antigravity/scratch/ai-agent
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate       # Mac/Linux
# venv\Scripts\activate        # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Start the backend server
uvicorn main:app --reload --port 8000
```

Backend will be live at `http://localhost:8000`  
API docs at `http://localhost:8000/docs`

---

### 3. Frontend Setup

```bash
# In a new terminal tab
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend will be live at `http://localhost:5173`

---

## 🔑 Environment Variables

Create `backend/.env` from `backend/.env.example`:

```env
GEMINI_API_KEY=your_key_here          # Required — from aistudio.google.com
DATABASE_URL=sqlite+aiosqlite:///./agent.db
CHROMA_PATH=./chroma_store
MAX_MEMORY_MESSAGES=20
SIMILARITY_THRESHOLD=0.75
```

---

## 📂 Project Structure

```
ai-agent/
├── backend/
│   ├── main.py                  # FastAPI entrypoint
│   ├── requirements.txt
│   ├── agent/
│   │   ├── orchestrator.py      # Main agent brain
│   │   ├── memory.py            # Conversation memory
│   │   ├── knowledge.py         # Knowledge base
│   │   ├── research.py          # Web research tool
│   │   └── feedback.py          # Self-learning engine
│   ├── models/
│   │   └── database.py          # SQLAlchemy models
│   ├── api/
│   │   ├── chat.py              # Chat + WebSocket
│   │   ├── knowledge.py         # Knowledge CRUD
│   │   ├── feedback.py          # Feedback endpoints
│   │   └── research.py          # Research endpoints
│   └── utils/
│       └── embeddings.py        # Gemini embeddings
└── frontend/
    └── src/
        ├── components/
        │   ├── ChatWindow.jsx    # Main chat UI
        │   ├── MessageBubble.jsx # Message rendering
        │   ├── VoiceButton.jsx   # Voice control
        │   ├── FeedbackButtons.jsx # 👍/👎 + stars
        │   ├── ResearchPanel.jsx # Web research
        │   ├── KnowledgeBase.jsx # Knowledge browser
        │   ├── MetricsPanel.jsx  # Dashboard
        │   └── Sidebar.jsx       # Navigation
        ├── hooks/
        │   ├── useVoice.js       # Speech API hook
        │   └── useChat.js        # Chat hook
        ├── store/agentStore.js   # Zustand state
        └── api/client.js         # Axios client
```

---

## 🔄 Self-Learning Mechanism

```
1. User asks a question
2. Agent retrieves relevant memory + knowledge (semantic search)
3. Gemini generates a response using enriched context
4. User rates the response (👍/👎 + 1-5 stars)
5. High-rated responses become few-shot examples
6. Future similar queries receive better context
7. Metrics dashboard shows improvement over time
```

---

## ☁️ Deployment (Free)

### Backend → Render.com

1. Push code to GitHub
2. Create new **Web Service** on [render.com](https://render.com)
3. Set **Build Command**: `pip install -r requirements.txt`
4. Set **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variable: `GEMINI_API_KEY=your_key`
6. Deploy ✅

### Frontend → Vercel

1. Run `npm run build` in `frontend/`
2. Install Vercel CLI: `npm i -g vercel`
3. Run `vercel` in the `frontend/` directory
4. Set env var `VITE_API_URL` to your Render backend URL
5. Deploy ✅

---

## 📊 API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/chat` | Send a message |
| WS | `/api/chat/ws/{session_id}` | Streaming chat |
| GET | `/api/chat/history/{session_id}` | Conversation history |
| POST | `/api/feedback` | Submit feedback |
| GET | `/api/feedback/metrics` | Improvement metrics |
| GET | `/api/knowledge` | Browse knowledge base |
| POST | `/api/research/search` | Web research |
| GET | `/api/metrics` | Dashboard data |
| GET | `/health` | Health check |

Full interactive docs: `http://localhost:8000/docs`

---

## 🎓 Academic Report Notes

### Modules Covered
- **Natural Language Processing**: Gemini LLM for understanding + generation
- **Information Retrieval**: ChromaDB vector similarity search
- **Machine Learning**: Embedding-based semantic matching, feedback-driven improvement
- **Web Technologies**: FastAPI REST + WebSocket, React SPA
- **Database Systems**: SQLite relational + ChromaDB vector store
- **Cloud Computing**: Render + Vercel free-tier deployment
- **Human-Computer Interaction**: Voice interface, responsive design

### Measurable Self-Improvement
Track via `/api/feedback/metrics/history`:
- Average feedback score over time
- 7-day rolling average vs all-time average
- Knowledge base growth rate
- Response quality trend

---

## 🛠️ Tech Stack

| Component | Technology | Cost |
|---|---|---|
| LLM | Google Gemini 1.5 Flash | Free (15 RPM) |
| Embeddings | Gemini text-embedding-004 | Free |
| Vector DB | ChromaDB (embedded) | Free |
| SQL DB | SQLite → PostgreSQL | Free |
| Web Search | DuckDuckGo Search | Free |
| Voice | Web Speech API | Free |
| Backend | FastAPI + Python | Free |
| Frontend | React + Vite + Tailwind | Free |
| Hosting | Render + Vercel | Free |

**Total cost: \$0/month**

---

## 📄 License
MIT — Free to use for academic purposes.
