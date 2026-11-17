from datetime import datetime
from typing import Annotated
from uuid import UUID

from ai.agents.schemas import AgentPrincipal
from ai.rag.embeddings import EmbeddingError
from ai.rag.ingestion import MAX_DOCUMENT_BYTES
from ai.rag.postgres import RetrievedChunk
from ai.rag.service import RAGService
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.agents import get_agent_principal
from app.api.auth import get_current_user
from app.api.courses import get_accessible_course_ids
from app.api.dependencies import get_rag_service
from app.core.database import get_db_session
from app.models.documents import Document
from app.models.users import User

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_filename: str
    title: str | None
    mime_type: str
    course_id: str | None
    created_at: datetime


class DocumentSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=4096)
    top_k: int = Field(default=5, ge=1, le=10)
    course_id: str | None = Field(default=None, min_length=1, max_length=255)


class DocumentSearchResult(BaseModel):
    id: UUID
    document_id: UUID
    source_filename: str
    page_number: int | None
    section_title: str | None
    content: str
    score: float


class DocumentUploadResponse(BaseModel):
    id: UUID
    source_filename: str
    status: str


async def _read_limited(upload: UploadFile) -> bytes:
    content = bytearray()
    while chunk := await upload.read(64 * 1024):
        content.extend(chunk)
        if len(content) > MAX_DOCUMENT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Document exceeds the {MAX_DOCUMENT_BYTES}-byte limit",
            )
    return bytes(content)


@router.post("", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: Annotated[UploadFile, File()],
    service: Annotated[RAGService, Depends(get_rag_service)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    course_id: Annotated[str | None, Form()] = None,
) -> DocumentUploadResponse:
    if course_id is not None and course_id not in principal.allowed_course_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )
    content = await _read_limited(file)
    filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    try:
        document_id = await service.ingest(
            session,
            filename=filename,
            content=content,
            owner_id=principal.user_id,
            course_id=course_id,
            declared_mime_type=file.content_type,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except EmbeddingError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document embedding is unavailable; configure the inference models",
        ) from exc
    return DocumentUploadResponse(
        id=document_id,
        source_filename=filename,
        status="indexed",
    )


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[DocumentResponse]:
    documents = await session.scalars(
        select(Document)
        .where(
            or_(
                Document.owner_id == principal.user_id,
                Document.course_id.in_(principal.allowed_course_ids),
            )
        )
        .order_by(Document.created_at.desc(), Document.id)
    )
    return [DocumentResponse.model_validate(document) for document in documents]


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    course_ids = await get_accessible_course_ids(user, session)
    course_document_access = (
        Document.course_id.in_(course_ids)
        if user.role in {"professor", "administrator"} and course_ids
        else False
    )
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            or_(
                Document.owner_id == user.clerk_user_id,
                course_document_access,
            ),
        )
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document was not found",
        )
    await session.delete(document)
    await session.commit()


@router.post("/search", response_model=list[DocumentSearchResult])
async def search_documents(
    body: DocumentSearchRequest,
    service: Annotated[RAGService, Depends(get_rag_service)],
    principal: Annotated[AgentPrincipal, Depends(get_agent_principal)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[DocumentSearchResult]:
    if (
        body.course_id is not None
        and body.course_id not in principal.allowed_course_ids
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course was not found",
        )
    try:
        result = await service.retrieve(
            session,
            body.query,
            user_id=principal.user_id,
            allowed_course_ids=(
                frozenset({body.course_id})
                if body.course_id is not None
                else principal.allowed_course_ids
            ),
            course_id=body.course_id,
            top_k=body.top_k,
        )
    except EmbeddingError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document search is unavailable; configure the inference models",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return [_search_result(chunk) for chunk in result.chunks]


def _search_result(chunk: RetrievedChunk) -> DocumentSearchResult:
    return DocumentSearchResult(
        id=chunk.id,
        document_id=chunk.document_id,
        source_filename=chunk.source_filename,
        page_number=chunk.page_number,
        section_title=chunk.section_title,
        content=chunk.content,
        score=chunk.score,
    )
