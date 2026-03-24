import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.db.models.enums import Platform


class ScheduleRequest(BaseModel):
    cron_expression: str = Field(examples=["0 */6 * * *"])
    platforms: list[Platform]
    is_active: bool = True


class ScheduleResponse(BaseModel):
    id: uuid.UUID
    cron_expression: str
    platforms: list[Platform]
    is_active: bool
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
