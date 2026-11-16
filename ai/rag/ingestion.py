from __future__ import annotations

import io
import logging
import re
import unicodedata
from dataclasses import dataclass
from zipfile import BadZipFile, ZipFile

from docx import Document as DocxDocument
from docx.table import Table as DocxTable
from docx.text.paragraph import Paragraph
from pptx import Presentation
from pypdf import PdfReader

logger = logging.getLogger(__name__)

MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

_MIME_TYPES: dict[str, set[str]] = {
    ".pdf": {"application/pdf"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    ".pptx": {
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
    ".txt": {"text/plain"},
    ".md": {"text/markdown", "text/plain"},
}
_DEFAULT_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
}


class ExtractionError(ValueError):
    """Raised when an uploaded document cannot be safely extracted."""


@dataclass(frozen=True, slots=True)
class ExtractedSegment:
    text: str
    page_number: int | None = None
    section_title: str | None = None


@dataclass(frozen=True, slots=True)
class ExtractionMetadata:
    title: str | None = None
    author: str | None = None
    mime_type: str = "application/octet-stream"


@dataclass(frozen=True, slots=True)
class ExtractedDocument:
    source_filename: str
    segments: tuple[ExtractedSegment, ...]
    metadata: ExtractionMetadata


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFC", text.replace("\r\n", "\n").replace("\r", "\n"))
    lines = [line.strip() for line in normalized.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _metadata_value(value: object | None) -> str | None:
    if value is None:
        return None
    normalized = normalize_text(str(value))
    return normalized[:512] or None


class DocumentExtractor:
    def __init__(self, max_bytes: int = MAX_DOCUMENT_BYTES) -> None:
        if max_bytes < 1:
            raise ValueError("max_bytes must be positive")
        self.max_bytes = max_bytes

    def extract(
        self,
        filename: str,
        content: bytes,
        declared_mime_type: str | None = None,
    ) -> ExtractedDocument:
        safe_name = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
        suffix = "." + safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
        if not safe_name or suffix not in _MIME_TYPES:
            raise ExtractionError("Unsupported document type")
        if len(safe_name) > 255 or any(
            unicodedata.category(character) == "Cc" for character in safe_name
        ):
            raise ExtractionError("Filename is invalid or exceeds 255 characters")
        if not content:
            raise ExtractionError("Uploaded document is empty")
        if len(content) > self.max_bytes:
            raise ExtractionError(f"Document exceeds the {self.max_bytes}-byte limit")

        mime_type = self._validate_mime(suffix, content, declared_mime_type)
        try:
            if suffix == ".pdf":
                segments, title, author = self._extract_pdf(content)
            elif suffix == ".docx":
                segments, title, author = self._extract_docx(content)
            elif suffix == ".pptx":
                segments, title, author = self._extract_pptx(content)
            else:
                segments, title, author = self._extract_text(content, suffix == ".md")
        except ExtractionError:
            raise
        except Exception as exc:
            logger.exception("Document extraction failed for %s", safe_name)
            raise ExtractionError(f"Could not extract {suffix[1:].upper()} content") from exc

        nonempty = tuple(
            ExtractedSegment(
                text=normalized,
                page_number=segment.page_number,
                section_title=segment.section_title,
            )
            for segment in segments
            if (normalized := normalize_text(segment.text))
        )
        if not nonempty:
            raise ExtractionError("Document contains no extractable text")
        return ExtractedDocument(
            source_filename=safe_name,
            segments=nonempty,
            metadata=ExtractionMetadata(
                title=title,
                author=author,
                mime_type=mime_type,
            ),
        )

    @staticmethod
    def _validate_mime(
        suffix: str,
        content: bytes,
        declared_mime_type: str | None,
    ) -> str:
        allowed = _MIME_TYPES[suffix]
        declared = (
            declared_mime_type.split(";", 1)[0].strip().lower()
            if declared_mime_type
            else None
        )
        if declared is not None and declared not in allowed:
            raise ExtractionError("Declared MIME type does not match the file extension")

        if suffix == ".pdf":
            valid = b"%PDF-" in content[:1024]
        elif suffix in {".docx", ".pptx"}:
            expected_member = "word/document.xml" if suffix == ".docx" else "ppt/presentation.xml"
            try:
                with ZipFile(io.BytesIO(content)) as archive:
                    valid = expected_member in archive.namelist()
                    if sum(item.file_size for item in archive.infolist()) > 100 * 1024 * 1024:
                        raise ExtractionError("Office document expands beyond the safety limit")
            except BadZipFile:
                valid = False
        else:
            try:
                text = content.decode("utf-8-sig")
                valid = "\x00" not in text
            except UnicodeDecodeError:
                valid = False
        if not valid:
            raise ExtractionError("File content does not match the supported document type")
        return declared or _DEFAULT_MIME_TYPES[suffix]

    @staticmethod
    def _extract_pdf(content: bytes) -> tuple[list[ExtractedSegment], str | None, str | None]:
        reader = PdfReader(io.BytesIO(content))
        metadata = reader.metadata
        segments = [
            ExtractedSegment(text=page.extract_text() or "", page_number=index + 1)
            for index, page in enumerate(reader.pages)
        ]
        return (
            segments,
            _metadata_value(metadata.title) if metadata else None,
            _metadata_value(metadata.author) if metadata else None,
        )

    @staticmethod
    def _extract_docx(content: bytes) -> tuple[list[ExtractedSegment], str | None, str | None]:
        document = DocxDocument(io.BytesIO(content))
        sections: list[ExtractedSegment] = []
        current_title: str | None = None
        current_lines: list[str] = []
        for item in document.iter_inner_content():
            if isinstance(item, Paragraph):
                value = item.text.strip()
                is_heading = item.style.name.startswith("Heading")
            elif isinstance(item, DocxTable):
                value = "\n".join(
                    " | ".join(cell.text.strip() for cell in row.cells)
                    for row in item.rows
                ).strip()
                is_heading = False
            else:
                continue
            if not value:
                continue
            if is_heading:
                if current_lines:
                    sections.append(
                        ExtractedSegment(
                            "\n".join(current_lines),
                            section_title=current_title,
                        )
                    )
                current_title = value[:512]
                current_lines = [value]
            else:
                current_lines.append(value)
        if current_lines:
            sections.append(ExtractedSegment("\n".join(current_lines), section_title=current_title))
        properties = document.core_properties
        return sections, _metadata_value(properties.title), _metadata_value(properties.author)

    @staticmethod
    def _extract_pptx(content: bytes) -> tuple[list[ExtractedSegment], str | None, str | None]:
        presentation = Presentation(io.BytesIO(content))
        segments: list[ExtractedSegment] = []
        for slide_number, slide in enumerate(presentation.slides, start=1):
            title = slide.shapes.title.text.strip() if slide.shapes.title else None
            text = "\n".join(
                shape.text for shape in slide.shapes if getattr(shape, "has_text_frame", False)
            )
            segments.append(
                ExtractedSegment(
                    text=text,
                    page_number=slide_number,
                    section_title=title[:512] if title else None,
                )
            )
        properties = presentation.core_properties
        return segments, _metadata_value(properties.title), _metadata_value(properties.author)

    @staticmethod
    def _extract_text(
        content: bytes,
        markdown: bool,
    ) -> tuple[list[ExtractedSegment], str | None, str | None]:
        text = content.decode("utf-8-sig")
        if not markdown:
            return [ExtractedSegment(text=text)], None, None
        segments: list[ExtractedSegment] = []
        title: str | None = None
        current_title: str | None = None
        current_lines: list[str] = []
        for line in text.splitlines():
            heading = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$", line)
            if heading:
                if current_lines:
                    segments.append(
                        ExtractedSegment("\n".join(current_lines), section_title=current_title)
                    )
                current_title = heading.group(1).strip()[:512]
                title = title or current_title
                current_lines = [line]
            else:
                current_lines.append(line)
        if current_lines:
            segments.append(ExtractedSegment("\n".join(current_lines), section_title=current_title))
        return segments, title, None
