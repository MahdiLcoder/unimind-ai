from __future__ import annotations

import re

from ai.agents.schemas import AgentName, Intent, RoutingDecision

_LEARNING_TERMS = re.compile(
    r"\b(quiz|quizzes|flashcards?|lesson|teach|explain|practice|mock exam|"
    r"test me|study plan|evaluate my answer|knowledge gaps?)\b",
    re.IGNORECASE,
)
_KNOWLEDGE_TERMS = re.compile(
    r"\b(document|notes|syllabus|course|handbook|policy|university|campus|"
    r"according to|from the|based on|cite|source)\b",
    re.IGNORECASE,
)


def route_request(message: str) -> RoutingDecision:
    normalized = message.strip()
    if not normalized:
        raise ValueError("A non-empty message is required for routing")

    asks_to_learn = bool(_LEARNING_TERMS.search(normalized))
    asks_about_sources = bool(_KNOWLEDGE_TERMS.search(normalized))
    if asks_to_learn and asks_about_sources:
        return RoutingDecision(
            intent=Intent.KNOWLEDGE_AND_LEARNING,
            selected_agents=(AgentName.KNOWLEDGE, AgentName.LEARNING),
            plan=(
                "Retrieve relevant permitted university material and validate its citations.",
                "Create the requested learning activity from the request and retrieved context.",
                "Combine the grounded answer and learning activity.",
            ),
            parallel=True,
        )
    if asks_to_learn:
        return RoutingDecision(
            intent=Intent.LEARNING_ACTIVITY,
            selected_agents=(AgentName.LEARNING,),
            plan=(
                "Identify the requested learning activity and learner context.",
                "Generate structured learning material and report any knowledge gaps.",
            ),
            parallel=False,
        )
    return RoutingDecision(
        intent=Intent.KNOWLEDGE_QUESTION,
        selected_agents=(AgentName.KNOWLEDGE,),
        plan=(
            "Search only documents accessible to the authenticated user.",
            "Rerank and answer from retrieved evidence with validated citations.",
        ),
        parallel=False,
    )
