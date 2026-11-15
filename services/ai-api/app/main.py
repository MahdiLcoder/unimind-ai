from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="UniMind AI API",
    description="Intelligent University Assistant powered by Multi-Agent AI",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "message": "Welcome to UniMind AI API",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/api/v1/test")
async def test_connection():
    return {
        "success": True,
        "message": "Frontend successfully connected to UniMind AI API",
    }