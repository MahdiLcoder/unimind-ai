from __future__ import annotations

from uuid import uuid4

import pytest
from ai.evaluation.rag import LLMAnswerQualityJudge, RAGEvaluator
from ai.models.config import ModelConfig, ModelProvider, RAGModelSettings
from ai.models.runtime import SingleModelRuntime
from ai.rag.embeddings import EmbeddingError, SentenceTransformerEmbedder
from ai.rag.postgres import PostgresRAGRepository, RetrievedChunk
from ai.rag.reranking import BGEReranker
from sqlalchemy import and_
from sqlalchemy.dialects import postgresql

from app.models.documents import DocumentChunk


class _Array:
    def __init__(self, values: list[list[float]]) -> None:
        self.values = values

    def tolist(self) -> list[list[float]]:
        return self.values


class _Encoder:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def encode(self, texts: list[str], **_: object) -> _Array:
        self.calls.append(texts)
        return _Array([[0.1, 0.2, 0.3] for _ in texts])


class _FakeEmbedder(SentenceTransformerEmbedder):
    def __init__(self, encoder: _Encoder) -> None:
        super().__init__(
            ModelConfig(
                provider=ModelProvider.HUGGINGFACE,
                model_id="test/embedding",
                dimensions=3,
            ),
            runtime=SingleModelRuntime(),
        )
        self.encoder = encoder

    def _load_model(self) -> _Encoder:
        return self.encoder


def test_embeddings_are_batched_cached_and_dimension_checked() -> None:
    encoder = _Encoder()
    embedder = _FakeEmbedder(encoder)

    first = embedder.embed(["Bonjour, bibliothèque"])
    second = embedder.embed(["Bonjour, bibliothèque"])

    assert first == second == [[0.1, 0.2, 0.3]]
    assert len(encoder.calls) == 1


def test_embedding_rejects_empty_text_and_wrong_dimensions() -> None:
    embedder = _FakeEmbedder(_Encoder())
    with pytest.raises(ValueError, match="empty text"):
        embedder.embed([" "])

    class WrongDimensions(_Encoder):
        def encode(self, texts: list[str], **_: object) -> _Array:
            return _Array([[0.5, 0.6] for _ in texts])

    with pytest.raises(EmbeddingError, match="dimensions"):
        _FakeEmbedder(WrongDimensions()).embed(["test"])

    class ZeroVector(_Encoder):
        def encode(self, texts: list[str], **_: object) -> _Array:
            return _Array([[0.0, 0.0, 0.0] for _ in texts])

    with pytest.raises(EmbeddingError, match="zero vector"):
        _FakeEmbedder(ZeroVector()).embed(["test"])


def test_single_model_runtime_releases_previous_model() -> None:
    runtime = SingleModelRuntime()
    first = object()
    second = object()

    assert runtime.run("first", lambda: first, lambda model: model) is first
    result = runtime.run("second", lambda: second, lambda model: model)

    assert result is second
    assert runtime._model_id == "second"
    runtime.unload()
    assert runtime._model_id is None


def test_reranker_orders_candidates_with_injected_model() -> None:
    class CrossEncoder:
        def predict(self, pairs: list[tuple[str, str]], **_: object) -> list[float]:
            return [0.1, 0.9, 0.3][: len(pairs)]

    class FakeReranker(BGEReranker):
        def _load_model(self) -> CrossEncoder:
            return CrossEncoder()

    reranker = FakeReranker(
        ModelConfig(
            provider=ModelProvider.HUGGINGFACE,
            model_id="test/reranker",
        ),
        runtime=SingleModelRuntime(),
    )

    assert reranker.rerank("question", ["a", "b", "c"], top_k=2) == [
        (1, 0.9),
        (2, 0.3),
    ]


def test_model_config_uses_environment_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HF_EMBEDDING_MODEL", "BAAI/bge-m3")
    monkeypatch.setenv("HF_EMBEDDING_DIMENSIONS", "1024")
    monkeypatch.setenv("HF_RERANKER_MODEL", "BAAI/bge-reranker-base")
    monkeypatch.setenv("HF_RERANKER_ENABLED", "false")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:3b")

    settings = RAGModelSettings.from_environment()

    assert settings.embedding.model_id == "BAAI/bge-m3"
    assert settings.embedding.dimensions == 1024
    assert settings.reranker.model_id == "BAAI/bge-reranker-base"
    assert settings.reranker_enabled is False
    assert settings.generation.model_id == "qwen2.5:3b"


def test_model_config_rejects_invalid_reranker_toggle(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HF_RERANKER_ENABLED", "sometimes")

    with pytest.raises(ValueError, match="HF_RERANKER_ENABLED must be a boolean"):
        RAGModelSettings.from_environment()


def test_repository_filters_include_identity_course_and_model() -> None:
    document_id = uuid4()
    filters = PostgresRAGRepository._access_filters(
        "user-a",
        {"course-a", "course-b"},
        "BAAI/bge-m3",
        "course-a",
        [document_id],
    )
    compiled = str(and_(*filters).compile(dialect=postgresql.dialect()))

    assert "owner_id" in compiled
    assert "course_id" in compiled
    assert "embedding_model" in compiled
    assert "document_id" in compiled


@pytest.mark.asyncio
async def test_postgres_search_compiles_hybrid_queries_and_normalizes_scores() -> None:
    document_id = uuid4()
    semantic_chunk = DocumentChunk(
        id=uuid4(),
        document_id=document_id,
        owner_id="user-a",
        course_id="course-a",
        chunk_index=0,
        content="Library hours are 8 to 20.",
        page_number=2,
        section_title="Hours",
        source_filename="guide.pdf",
        embedding=[1.0] + [0.0] * 1023,
        embedding_model="BAAI/bge-m3",
    )
    lexical_chunk = DocumentChunk(
        id=uuid4(),
        document_id=document_id,
        owner_id="user-a",
        course_id="course-a",
        chunk_index=1,
        content="The campus library is open.",
        page_number=3,
        section_title="Access",
        source_filename="guide.pdf",
        embedding=[0.0, 1.0] + [0.0] * 1022,
        embedding_model="BAAI/bge-m3",
    )

    class _Result:
        def __init__(self, rows: list[tuple[DocumentChunk, float]]) -> None:
            self.rows = rows

        def all(self) -> list[tuple[DocumentChunk, float]]:
            return self.rows

    class _Session:
        def __init__(self) -> None:
            self.statements: list[str] = []

        async def execute(self, statement: object) -> _Result:
            sql = str(statement.compile(dialect=postgresql.dialect()))
            self.statements.append(sql)
            if "@@" in sql:
                return _Result([(semantic_chunk, 0.5), (lexical_chunk, 1.0)])
            return _Result([(semantic_chunk, 0.2)])

    session = _Session()
    results = await PostgresRAGRepository().search(
        session,  # type: ignore[arg-type]
        query_text="library opening hours",
        query_embedding=[1.0] + [0.0] * 1023,
        user_id="user-a",
        allowed_course_ids={"course-a"},
        embedding_model="BAAI/bge-m3",
        top_k=2,
        candidate_limit=4,
    )

    assert len(session.statements) == 2
    assert "<=>" in session.statements[0]
    assert "to_tsvector" in session.statements[1]
    assert "embedding_model" in session.statements[0]
    assert results[0].id == semantic_chunk.id
    assert results[0].score == pytest.approx(0.75 * 0.8 + 0.25 * (0.5 / 1.5))
    assert results[1].id == lexical_chunk.id
    assert results[1].score == pytest.approx(0.125)


class _Judge:
    async def faithfulness(self, answer: str, evidence: str) -> float:
        assert answer and evidence
        return 0.9

    async def relevance(self, query: str, answer: str) -> float:
        assert query and answer
        return 0.8


class _ScoreGenerator:
    def __init__(self, response: str) -> None:
        self.response = response
        self.prompts: list[str] = []

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        self.prompts.append(f"{system_prompt}\n{user_prompt}")
        return self.response


@pytest.mark.asyncio
async def test_llm_answer_judge_scores_and_isolates_evidence() -> None:
    generator = _ScoreGenerator('{"score": 0.75}')
    judge = LLMAnswerQualityJudge(generator)

    assert await judge.faithfulness("Answer", "<source>Evidence</source>") == 0.75
    assert "&lt;source&gt;" in generator.prompts[0]
    assert await judge.relevance("Question", "Answer") == 0.75


@pytest.mark.asyncio
@pytest.mark.parametrize("response", ["not-json", '{"score": true}', '{"score": 1.2}'])
async def test_llm_answer_judge_rejects_malformed_or_invalid_scores(response: str) -> None:
    judge = LLMAnswerQualityJudge(_ScoreGenerator(response))
    with pytest.raises(ValueError):
        await judge.relevance("Question", "Answer")


@pytest.mark.asyncio
async def test_rag_evaluation_computes_retrieval_citations_and_answer_scores() -> None:
    first_id = uuid4()
    second_id = uuid4()
    document_id = uuid4()
    chunk = RetrievedChunk(
        id=first_id,
        document_id=document_id,
        course_id="course",
        content="Library hours are 8 to 20.",
        chunk_index=0,
        page_number=2,
        section_title=None,
        source_filename="guide.pdf",
        score=0.8,
    )
    from ai.rag.context import SourceCitation

    citation = SourceCitation(
        document_id=document_id,
        chunk_id=first_id,
        source_filename="guide.pdf",
        page_number=2,
        section_title=None,
        citation=f"[doc:{document_id} p.2]",
    )
    result = await RAGEvaluator().evaluate(
        query="When is the library open?",
        relevant_chunk_ids={first_id, second_id},
        retrieved_chunks=[chunk],
        answer=f"From the guide: {citation.citation}",
        citations=(citation,),
        evidence=chunk.content,
        latency_ms=142.5,
        judge=_Judge(),
        k=2,
    )

    assert result.recall_at_k == 0.5
    assert result.precision_at_k == 0.5
    assert result.mean_reciprocal_rank == 1.0
    assert result.retrieval_relevance == 0.8
    assert result.answer_faithfulness == 0.9
    assert result.answer_relevance == 0.8
    assert result.citation_correctness == 1.0
    assert result.latency_ms == 142.5
