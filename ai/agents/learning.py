from __future__ import annotations

import asyncio
from logging import getLogger

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain_ollama import ChatOllama

from ai.agents.schemas import LearningResponse
from ai.state.agent import AgentState

logger = getLogger(__name__)


@tool
def exact_answer_match(student_answer: str, expected_answer: str) -> bool:
    """Compare a student's answer to a reference answer after basic normalization."""
    def normalize(value: str) -> str:
        return " ".join(value.casefold().split()).strip(" .!?")

    return normalize(student_answer) == normalize(expected_answer)


class LearningAgent:
    def __init__(
        self,
        model: ChatOllama,
        *,
        concurrency_limit: asyncio.Semaphore,
    ) -> None:
        self.concurrency_limit = concurrency_limit
        system_prompt = (
            "You are UniMind AI's learning coach. Respond to the learner's "
            "request as the requested activity (explanation, personalized "
            "lesson, flashcards, quiz, mock examination, answer evaluation, "
            "or knowledge-gap analysis). Use the learner role and prior "
            "conversation for personalization. Distinguish established "
            "facts from assumptions. Return only the requested structured "
            "schema. For an answer evaluation, include the student's answer, "
            "a reference answer, helpful feedback, and identified gaps."
        )
        self._chain = (
            ChatPromptTemplate.from_messages(
                [
                    ("system", system_prompt),
                    MessagesPlaceholder("history"),
                    ("human", "Learner role: {role}\nRequest: {message}"),
                ]
            )
            | model.with_structured_output(LearningResponse)
        )

    async def execute(self, state: AgentState) -> dict[str, object]:
        history = state.get("conversation_history", [])
        async with self.concurrency_limit:
            result = await self._chain.ainvoke(
                {
                    "history": history[:-1],
                    "role": state["user_role"].value,
                    "message": state["user_message"],
                }
            )
        response = (
            result
            if isinstance(result, LearningResponse)
            else LearningResponse.model_validate(result)
        )
        content = response.response
        if response.evaluation is not None:
            match = exact_answer_match.invoke(
                {
                    "student_answer": response.evaluation.student_answer,
                    "expected_answer": response.evaluation.expected_answer,
                }
            )
            content = (
                f"{content}\n\nExact normalized answer match: "
                f"{'yes' if match else 'no'}."
            )
        return {
            "agent_outputs": {
                "learning": {
                    **response.model_dump(mode="json"),
                    "content": content,
                    "evidence_sufficient": True,
                }
            }
        }
