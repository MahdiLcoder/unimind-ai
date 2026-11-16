from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.users import UserRole


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    clerk_user_id: str
    email: str | None
    role: UserRole
    created_at: datetime
