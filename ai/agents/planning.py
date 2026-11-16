from __future__ import annotations

import asyncio

from langchain_core.language_models.chat_models import BaseChatModel
from pydantic import BaseModel, ConfigDict, Field

from ai.state.agent import AgentState


class PlannedTask(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    due_date: str | None = None
    estimated_hours: float = Field(ge=0, le=100)
    priority: str = Field(min_length=1, max_length=32)
    rationale: str = Field(max_length=1000)


class PlanningResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    tasks: list[PlannedTask] = Field(default_factory=list, max_length=50)
    overload_warning: str | None = None
    assumptions: list[str] = Field(default_factory=list, max_length=20)


class PlanningAgent:
    def __init__(
        self,
        model: BaseChatModel,
        *,
        concurrency_limit: asyncio.Semaphore | None = None,
    ) -> None:
        self._chain = model.with_structured_output(PlanningResponse)
        self.concurrency_limit = concurrency_limit

    async def execute(self, state: AgentState) -> dict[str, object]:
        prompt = (
            "Create an adaptive, realistic study and assignment plan. Use only "
            "deadlines, availability, progress, and preferences explicitly "
            "provided below. Do not invent dates, course requirements, or "
            "learning progress. Prioritize urgent and high-impact tasks, keep "
            "daily workload within the user's stated capacity, and flag overload "
            "or missing information. State assumptions and ask for details "
            "when a schedule cannot be grounded.\n\n"
            f"User role: {state['user_role'].value}\n"
            f"Request and supplied planning details:\n{state['user_message']}"
        )
        if self.concurrency_limit is None:
            result = await self._chain.ainvoke(prompt)
        else:
            async with self.concurrency_limit:
                result = await self._chain.ainvoke(prompt)
        plan = (
            result
            if isinstance(result, PlanningResponse)
            else PlanningResponse.model_validate(result)
        )
        lines = [plan.summary]
        for task in plan.tasks:
            due = f" (due {task.due_date})" if task.due_date else ""
            lines.append(
                f"- {task.title}{due}: {task.estimated_hours:g}h, "
                f"{task.priority} priority. {task.rationale}"
            )
        if plan.overload_warning:
            lines.append(f"Workload warning: {plan.overload_warning}")
        if plan.assumptions:
            lines.append("Assumptions / missing details: " + "; ".join(plan.assumptions))
        return {
            "agent_outputs": {
                "planning": {
                    "content": "\n".join(lines),
                    "evidence_sufficient": True,
                    "plan": plan.model_dump(mode="json"),
                }
            }
        }
