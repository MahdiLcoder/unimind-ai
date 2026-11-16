import re
from html import escape
from unicodedata import normalize

_INJECTION_PATTERNS = (
    re.compile(r"\bignore\s+(all\s+)?(previous|prior|above)\s+instructions\b", re.I),
    re.compile(r"\bdisregard\s+(the\s+)?(system|developer|previous)\b", re.I),
    re.compile(r"\breveal\s+(the\s+)?(system|hidden|developer)\s+prompt\b", re.I),
    re.compile(r"\bact\s+as\s+(the\s+)?system\b", re.I),
    re.compile(r"\bthis\s+document\s+overrides?\s+instructions\b", re.I),
)


def preprocess_query(query: str, max_characters: int = 4096) -> str:
    normalized = " ".join(normalize("NFKC", query).split())
    if not normalized:
        raise ValueError("Query cannot be empty")
    if len(normalized) > max_characters:
        raise ValueError(f"Query exceeds the {max_characters}-character limit")
    return normalized


def has_prompt_injection(text: str) -> bool:
    return any(pattern.search(text) for pattern in _INJECTION_PATTERNS)


def isolate_untrusted_text(text: str) -> str:
    return escape(text, quote=True)
