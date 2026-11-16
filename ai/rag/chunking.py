import re
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from ai.rag.ingestion import ExtractedDocument, ExtractedSegment


class ChunkingStrategy(StrEnum):
    FIXED = "fixed"
    OVERLAPPING = "overlapping"
    RECURSIVE = "recursive"
    STRUCTURE_AWARE = "structure_aware"


@dataclass(frozen=True, slots=True)
class ChunkingConfig:
    strategy: ChunkingStrategy = ChunkingStrategy.RECURSIVE
    chunk_size: int = 1200
    chunk_overlap: int = 150

    def __post_init__(self) -> None:
        if self.chunk_size < 1:
            raise ValueError("chunk_size must be positive")
        if self.chunk_overlap < 0 or self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap must be non-negative and smaller than chunk_size")


@dataclass(frozen=True, slots=True)
class Chunk:
    text: str
    document_id: UUID
    course_id: str | None
    chunk_index: int
    page_number: int | None
    section_title: str | None
    source_filename: str


def chunk_document(
    document: ExtractedDocument,
    document_id: UUID,
    course_id: str | None = None,
    config: ChunkingConfig = ChunkingConfig(),
) -> list[Chunk]:
    chunks: list[Chunk] = []
    for segment in document.segments:
        if config.strategy == ChunkingStrategy.STRUCTURE_AWARE:
            pieces = _split_segment(segment, config, recursive=True)
        elif config.strategy == ChunkingStrategy.RECURSIVE:
            pieces = _split_segment(segment, config, recursive=True)
        elif config.strategy == ChunkingStrategy.OVERLAPPING:
            pieces = _split_segment(segment, config, recursive=False)
        else:
            pieces = _split_segment(
                segment,
                ChunkingConfig(config.strategy, config.chunk_size, 0),
                recursive=False,
            )
        for piece in pieces:
            chunks.append(
                Chunk(
                    text=piece,
                    document_id=document_id,
                    course_id=course_id,
                    chunk_index=len(chunks),
                    page_number=segment.page_number,
                    section_title=segment.section_title,
                    source_filename=document.source_filename,
                )
            )
    return chunks


def _split_segment(
    segment: ExtractedSegment,
    config: ChunkingConfig,
    recursive: bool,
) -> list[str]:
    text = segment.text.strip()
    if not text:
        return []
    if len(text) <= config.chunk_size:
        return [text]

    overlap = (
        0
        if config.strategy == ChunkingStrategy.FIXED
        else config.chunk_overlap
    )
    return _window_chunks(
        text,
        config.chunk_size,
        overlap,
        recursive=recursive,
        prefer_boundaries=config.strategy != ChunkingStrategy.FIXED,
    )


def _window_chunks(
    text: str,
    size: int,
    overlap: int,
    recursive: bool = False,
    prefer_boundaries: bool = True,
) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            separators = (
                ("\n\n", "\n", ". ", " ")
                if recursive
                else ((" ",) if prefer_boundaries else ())
            )
            for separator in separators:
                boundary = text.rfind(separator, start + size // 2, end)
                if boundary > start:
                    end = boundary
                    break
        chunks.append(re.sub(r"\s+", " ", text[start:end]).strip())
        if end == len(text):
            break
        next_start = max(start + 1, end - overlap)
        word_boundary = text.find(" ", next_start, end)
        if word_boundary > next_start:
            next_start = word_boundary + 1
        start = next_start
    return [chunk for chunk in chunks if chunk]
