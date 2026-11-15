# UniMind AI

An intelligent university assistant powered by collaborative
multi-agent systems and Retrieval-Augmented Generation (RAG).

## Architecture

- Frontend: Next.js 16, TypeScript, Tailwind CSS 4
- Backend: Python, FastAPI
- Agent orchestration: LangGraph
- LLM integrations: LangChain
- Models and embeddings: Hugging Face, Ollama
- Database: PostgreSQL + pgvector
- Cache: Redis
- Infrastructure: Docker, GitHub Actions, Kubernetes

## Project Structure

- apps/web: Next.js frontend
- services/ai-api: FastAPI backend
- ai: Agents, graphs, RAG and evaluation
- infrastructure: Docker, Kubernetes and monitoring
- docs: Architecture, diagrams and reports

## Development

Start the infrastructure:

    docker compose up -d

Start the backend:

    cd services/ai-api
    uv run uvicorn app.main:app --reload --port 8000

Start the frontend in another terminal:

    pnpm dev