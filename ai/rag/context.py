from __future__ import annotations

import re
from dataclasses import dataclass
from html import escape
from uuid import UUID

from ai.rag.postgres import RetrievedChunk
from ai.rag.security import has_prompt_injection, isolate_untrusted_text

_CITATION_PATTERN = re.compile(r"\[doc:([0-9a-fA-F-]+)(?: p\.(\d+))?\]")


@dataclass(frozen=True, slots=True)
class SourceCitation:
    document_id: UUID
    chunk_id: UUID
    source_filename: str
    page_number: int | None
    section_title: str | None
    citation: str


@dataclass(frozen=True, slots=True)
class AssembledContext:
    text: str
    citations: tuple[SourceCitation, ...]
    contains_injection_signals: bool


class ContextAssembler:
    def __init__(self, max_context_chars: int = 12_000) -> None:
        if max_context_chars < 1:
            raise ValueError("max_context_chars must be positive")
        self.max_context_chars = max_context_chars

    def assemble(self, chunks: list[RetrievedChunk]) -> AssembledContext:
        output: list[str] = []
        citations: list[SourceCitation] = []
        seen: set[str] = set()
        has_injection = False
        size = 0
        for chunk in chunks:
            fingerprint = " ".join(chunk.content.casefold().split())
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            citation = (
                f"[doc:{chunk.document_id} p.{chunk.page_number}]"
                if chunk.page_number is not None
                else f"[doc:{chunk.document_id}]"
            )
            header = f"{citation} {escape(chunk.source_filename, quote=True)}"
            if chunk.section_title:
                header += f" — {escape(chunk.section_title, quote=True)}"
            section = (
                f'<source citation="{citation}">\n'
                f"{isolate_untrusted_text(chunk.content)}\n"
                "</source>"
            )
            addition = f"{header}\n{section}"
            if size + len(addition) + (2 if output else 0) > self.max_context_chars:
                break
            output.append(addition)
            size += len(addition) + (2 if len(output) > 1 else 0)
            citations.append(
                SourceCitation(
                    document_id=chunk.document_id,
                    chunk_id=chunk.id,
                    source_filename=chunk.source_filename,
                    page_number=chunk.page_number,
                    section_title=chunk.section_title,
                    citation=citation,
                )
            )
            has_injection |= has_prompt_injection(chunk.content)
        return AssembledContext(
            text="\n\n".join(output),
            citations=tuple(citations),
            contains_injection_signals=has_injection,
        )


@dataclass(frozen=True, slots=True)
class CitationValidation:
    valid: bool
    cited: tuple[str, ...]
    invalid: tuple[str, ...]


def validate_citations(answer: str, citations: tuple[SourceCitation, ...]) -> CitationValidation:
    allowed = {citation.citation for citation in citations}
    found = tuple(dict.fromkeys(match.group(0) for match in _CITATION_PATTERN.finditer(answer)))
    invalid = tuple(citation for citation in found if citation not in allowed)
    if citations and not found:
        invalid = ("missing citation",)
    return CitationValidation(
        valid=bool(found) and not invalid if citations else not found,
        cited=tuple(citation for citation in found if citation in allowed),
        invalid=invalid,
    )
