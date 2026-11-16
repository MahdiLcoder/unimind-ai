from __future__ import annotations

from typing import Protocol

from ai.agents.schemas import LearningMemoryData


class LearningMemoryStore(Protocol):
    async def get(self, user_id: str) -> LearningMemoryData: ...

    async def put(
        self,
        user_id: str,
        memory: LearningMemoryData,
    ) -> LearningMemoryData: ...

    async def delete(self, user_id: str) -> None: ...


class PostgresLearningMemoryStore:
    def __init__(self, session_factory: object) -> None:
        self.session_factory = session_factory

    async def get(self, user_id: str) -> LearningMemoryData:
        from sqlalchemy import select

        from app.models.learning_memory import UserLearningMemory

        async with self.session_factory() as session:
            row = await session.scalar(
                select(UserLearningMemory).where(UserLearningMemory.user_id == user_id)
            )
        if row is None:
            return LearningMemoryData()
        return LearningMemoryData(
            preferences=row.preferences_json,
            progress=row.progress_json,
        )

    async def put(
        self,
        user_id: str,
        memory: LearningMemoryData,
    ) -> LearningMemoryData:
        from sqlalchemy import func
        from sqlalchemy.dialects.postgresql import insert

        from app.models.learning_memory import UserLearningMemory

        values = memory.model_dump(mode="json")
        statement = (
            insert(UserLearningMemory)
            .values(
                user_id=user_id,
                preferences_json=values["preferences"],
                progress_json=values["progress"],
            )
            .on_conflict_do_update(
                index_elements=[UserLearningMemory.user_id],
                set_={
                    "preferences_json": values["preferences"],
                    "progress_json": values["progress"],
                    "updated_at": func.now(),
                },
            )
        )
        async with self.session_factory() as session, session.begin():
            await session.execute(statement)
        return memory

    async def delete(self, user_id: str) -> None:
        from sqlalchemy import delete

        from app.models.learning_memory import UserLearningMemory

        async with self.session_factory() as session, session.begin():
            await session.execute(
                delete(UserLearningMemory).where(UserLearningMemory.user_id == user_id)
            )
