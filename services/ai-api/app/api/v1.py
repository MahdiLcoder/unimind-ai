from fastapi import APIRouter

router = APIRouter(prefix="/api/v1", tags=["api"])


@router.get("/test")
async def test_connection() -> dict[str, str | bool]:
    return {
        "success": True,
        "message": "Frontend successfully connected to UniMind AI API",
    }
