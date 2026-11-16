from __future__ import annotations

from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import AuditLog, PlatformSetting

DEFAULT_PLATFORM_FLAGS: Final[dict[str, bool]] = {
    "course_self_enrollment_enabled": True,
    "research_search_enabled": True,
}


async def platform_flag_enabled(
    session: AsyncSession,
    key: str,
) -> bool:
    if key not in DEFAULT_PLATFORM_FLAGS:
        raise ValueError(f"Unknown platform feature flag: {key}")
    value = await session.scalar(
        select(PlatformSetting.enabled).where(PlatformSetting.key == key)
    )
    return DEFAULT_PLATFORM_FLAGS[key] if value is None else bool(value)


def add_audit_log(
    session: AsyncSession,
    *,
    actor_id: str,
    action: str,
    resource_type: str,
    resource_id: str | None,
    details: dict[str, object],
) -> None:
    session.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
        )
    )
