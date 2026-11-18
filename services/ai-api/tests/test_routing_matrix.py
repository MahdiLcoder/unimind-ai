"""Small, explicit routing contract cases for the supervisor classifier."""

import pytest
from ai.agents.routing import route_request
from ai.agents.schemas import AgentName


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Summarize my lecture notes", (AgentName.KNOWLEDGE,)),
        (
            "Explain the central limit theorem and its significance in "
            "statistical inference.",
            (AgentName.KNOWLEDGE,),
        ),
        ("Explain Bayesian inference in simple terms with an example.", (AgentName.LEARNING,)),
        ("Create flashcards about calculus", (AgentName.LEARNING,)),
        ("Find academic papers about retrieval augmented generation", (AgentName.RESEARCH,)),
        ("Debug this Python function", (AgentName.CODING,)),
        ("Make me a weekly study plan", (AgentName.PLANNING,)),
        ("What are the exam regulations?", (AgentName.UNIVERSITY_SERVICES,)),
        (
            "Explain this course syllabus and quiz me on it",
            (AgentName.LEARNING, AgentName.KNOWLEDGE),
        ),
    ],
)
def test_representative_intents_select_expected_agents(
    message: str,
    expected: tuple[AgentName, ...],
) -> None:
    decision = route_request(message)

    assert decision.selected_agents == expected
    assert len(decision.selected_agents) == len(decision.plan)
    assert all(batch for batch in decision.execution_batches)


def test_routing_rejects_blank_input() -> None:
    with pytest.raises(ValueError, match="non-empty"):
        route_request("  \n ")
