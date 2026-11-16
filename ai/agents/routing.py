from __future__ import annotations

import re

from ai.agents.schemas import AgentName, Intent, RoutingDecision

_LEARNING_TERMS = re.compile(
    r"\b(quiz|quizzes|flashcards?|lesson|teach|explain|practice|mock exam|"
    r"test me|evaluate my answer|knowledge gaps?)\b",
    re.IGNORECASE,
)
_RESEARCH_TERMS = re.compile(
    r"\b(research|academic papers?|literature review|bibliograph(y|ies)|"
    r"citation style|research gaps?|compare (papers?|studies)|scholarly sources?)\b",
    re.IGNORECASE,
)
_CODING_TERMS = re.compile(
    r"\b(programming|code|coding|debug|review (this )?code|"
    r"programming exercise|write (a )?(function|class|program|script))\b",
    re.IGNORECASE,
)
_PLANNING_TERMS = re.compile(
    r"\b(study schedule|study plan|revision schedule|weekly plan|daily plan|"
    r"assignment deadlines?|prioriti[sz]e deadlines?|overloaded schedule|"
    r"plan my (week|day|studies))\b",
    re.IGNORECASE,
)
_UNIVERSITY_SERVICE_TERMS = re.compile(
    r"\b(registration|enrollment|enrolment|exam regulations?|examination rules?|"
    r"attendance requirements?|university procedures?|admissions contact|"
    r"registrar contact|official university contact)\b",
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
    selected: list[AgentName] = []
    for matches, agent in (
        (_RESEARCH_TERMS, AgentName.RESEARCH),
        (_CODING_TERMS, AgentName.CODING),
        (_PLANNING_TERMS, AgentName.PLANNING),
        (_UNIVERSITY_SERVICE_TERMS, AgentName.UNIVERSITY_SERVICES),
    ):
        if matches.search(normalized):
            selected.append(agent)
    if asks_to_learn:
        selected.append(AgentName.LEARNING)
    if asks_about_sources and asks_to_learn:
        selected.append(AgentName.KNOWLEDGE)
    if not selected:
        selected.append(AgentName.KNOWLEDGE)

    if len(selected) == 1:
        intent = {
            AgentName.KNOWLEDGE: Intent.KNOWLEDGE_QUESTION,
            AgentName.LEARNING: Intent.LEARNING_ACTIVITY,
            AgentName.RESEARCH: Intent.RESEARCH_TASK,
            AgentName.CODING: Intent.CODING_TASK,
            AgentName.PLANNING: Intent.PLANNING_TASK,
            AgentName.UNIVERSITY_SERVICES: Intent.UNIVERSITY_SERVICES_QUESTION,
        }[selected[0]]
    elif set(selected) == {AgentName.KNOWLEDGE, AgentName.LEARNING}:
        intent = Intent.KNOWLEDGE_AND_LEARNING
    else:
        intent = Intent.MULTI_AGENT_TASK

    batches: list[list[AgentName]] = []
    if AgentName.RESEARCH in selected and (
        AgentName.CODING in selected or AgentName.LEARNING in selected
    ):
        batches.append([AgentName.RESEARCH])
        selected.remove(AgentName.RESEARCH)
    batches.append(selected)

    descriptions = {
        AgentName.KNOWLEDGE: "Retrieve permitted university material and validate citations.",
        AgentName.LEARNING: "Generate the requested learning activity from available context.",
        AgentName.RESEARCH: "Search academic metadata and synthesize citable research evidence.",
        AgentName.CODING: (
            "Generate, explain, review, or debug code without executing it in the API."
        ),
        AgentName.PLANNING: "Create a schedule using stated priorities, deadlines, and capacity.",
        AgentName.UNIVERSITY_SERVICES: "Answer only from configured verified official sources.",
    }
    return RoutingDecision(
        intent=intent,
        selected_agents=tuple(agent for batch in batches for agent in batch),
        plan=tuple(descriptions[agent] for batch in batches for agent in batch),
        parallel=any(len(batch) > 1 for batch in batches),
        execution_batches=tuple(tuple(batch) for batch in batches),
    )
