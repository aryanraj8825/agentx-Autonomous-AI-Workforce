"""Request bodies. Responses are plain dicts (the frontend's camelCase shape)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: str
    password: str


class TaskOptions(BaseModel):
    formats: list[Literal["report", "csv", "xlsx", "plan"]] = ["report", "csv"]
    autonomy: Literal["ask", "autonomous"] = "ask"
    useMemory: bool = True
    tokenBudget: int = Field(60000, ge=5000, le=500000)
    notifySlack: bool = False


class Attachment(BaseModel):
    name: str = Field(max_length=200)
    size: int = 0
    uploadId: str | None = None


class TaskIn(BaseModel):
    prompt: str = Field(min_length=12, max_length=4000)
    title: str | None = Field(None, max_length=100)
    kind: Literal["market", "competitor", "literature"] | None = None
    options: TaskOptions = TaskOptions()
    attachments: list[Attachment] = Field(default_factory=list, max_length=6)


class PreviewIn(BaseModel):
    prompt: str = ""
    autonomy: Literal["ask", "autonomous"] = "ask"


class NodeAction(BaseModel):
    nodeId: str


class IdsIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=100)


class MemoryIn(BaseModel):
    type: Literal["preference", "research", "history"]
    title: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=8)


class MemorySearchIn(BaseModel):
    q: str = Field(min_length=1, max_length=300)
    k: int = Field(5, ge=1, le=20)


class ConnectIn(BaseModel):
    fields: dict[str, str] = Field(default_factory=dict)

    @field_validator("fields")
    @classmethod
    def _limit(cls, v):
        if len(v) > 8 or any(len(x) > 2000 for x in v.values()):
            raise ValueError("too many or too long fields")
        return v


class AgentConfigIn(BaseModel):
    model: str | None = Field(None, max_length=60)
    temperature: float | None = Field(None, ge=0, le=1)
    maxRetries: int | None = Field(None, ge=0, le=5)
    enabled: bool | None = None


class SettingsIn(BaseModel):
    approval: dict[str, bool] | None = None
    notifyDone: bool | None = None
    notifyApproval: bool | None = None
    density: Literal["comfortable", "compact"] | None = None
    twoFactor: bool | None = None
