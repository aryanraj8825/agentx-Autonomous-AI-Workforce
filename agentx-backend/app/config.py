"""Runtime configuration. Plain environment variables (optionally loaded from .env)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


def _load_dotenv(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.environ.get(name, default).split(",") if x.strip()]


DEV_SECRET = "dev-only-change-me"


@dataclass(frozen=True)
class Settings:
    env: str
    jwt_secret: str
    jwt_ttl_minutes: int
    secret_key: str  # encrypts integration credentials at rest
    cors_origins: list[str]

    db_backend: str  # memory | mongo
    mongo_url: str
    mongo_db: str
    vector_backend: str  # memory | qdrant
    qdrant_url: str
    qdrant_api_key: str
    redis_url: str
    run_mode: str  # inline | celery
    runner: str  # auto | langgraph | native

    llm_backend: str  # mock | gemini
    gemini_api_key: str
    gemini_base_url: str
    model_pro: str
    model_flash: str
    embed_model: str
    embed_dim: int
    tavily_api_key: str
    mock_llm_flaws: bool

    files_dir: str
    max_upload_mb: int
    max_concurrent_tasks_per_user: int
    node_timeout_s: int
    max_revisions: int
    enable_llm_code_exec: bool

    @property
    def is_prod(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    _load_dotenv()
    g = os.environ.get
    gemini_key = g("GEMINI_API_KEY", "")
    mongo_url = g("MONGO_URL", "")
    qdrant_url = g("QDRANT_URL", "")
    llm = g("LLM_BACKEND", "auto")
    if llm == "auto":
        llm = "gemini" if gemini_key else "mock"
    db = g("DB_BACKEND", "auto")
    if db == "auto":
        db = "mongo" if mongo_url else "memory"
    vec = g("VECTOR_BACKEND", "auto")
    if vec == "auto":
        vec = "qdrant" if qdrant_url else "memory"
    s = Settings(
        env=g("APP_ENV", "development"),
        jwt_secret=g("JWT_SECRET", DEV_SECRET),
        jwt_ttl_minutes=int(g("JWT_TTL_MINUTES", "720")),
        secret_key=g("SECRET_KEY", g("JWT_SECRET", DEV_SECRET)),
        cors_origins=_list("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"),
        db_backend=db,
        mongo_url=mongo_url,
        mongo_db=g("MONGO_DB", "agentx"),
        vector_backend=vec,
        qdrant_url=qdrant_url,
        qdrant_api_key=g("QDRANT_API_KEY", ""),
        redis_url=g("REDIS_URL", ""),
        run_mode=g("RUN_MODE", "inline"),
        runner=g("RUNNER", "auto"),
        llm_backend=llm,
        gemini_api_key=gemini_key,
        gemini_base_url=g("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
        model_pro=g("MODEL_PRO", "gemini-2.5-pro"),
        model_flash=g("MODEL_FLASH", "gemini-2.5-flash"),
        embed_model=g("EMBED_MODEL", "gemini-embedding-001"),
        embed_dim=int(g("EMBED_DIM", "768")),
        tavily_api_key=g("TAVILY_API_KEY", ""),
        mock_llm_flaws=_bool("MOCK_LLM_FLAWS", True),
        files_dir=g("FILES_DIR", "./data/files"),
        max_upload_mb=int(g("MAX_UPLOAD_MB", "15")),
        max_concurrent_tasks_per_user=int(g("MAX_CONCURRENT_TASKS_PER_USER", "3")),
        node_timeout_s=int(g("NODE_TIMEOUT_S", "300")),
        max_revisions=int(g("MAX_REVISIONS", "2")),
        enable_llm_code_exec=_bool("ENABLE_LLM_CODE_EXEC", False),
    )
    problems = validate(s)
    if problems:
        raise RuntimeError("Invalid configuration:\n- " + "\n- ".join(problems))
    return s


def validate(s: Settings) -> list[str]:
    p: list[str] = []
    if s.is_prod and s.jwt_secret == DEV_SECRET:
        p.append("JWT_SECRET must be set in production")
    if s.is_prod and len(s.jwt_secret) < 32:
        p.append("JWT_SECRET must be at least 32 characters in production")
    if s.is_prod and s.llm_backend == "mock":
        p.append("LLM_BACKEND=mock is not allowed in production (set GEMINI_API_KEY)")
    if s.run_mode == "celery" and (not s.redis_url or s.db_backend == "memory"):
        p.append("RUN_MODE=celery needs REDIS_URL and a persistent database (MONGO_URL)")
    if s.db_backend == "mongo" and not s.mongo_url:
        p.append("DB_BACKEND=mongo needs MONGO_URL")
    if s.vector_backend == "qdrant" and not s.qdrant_url:
        p.append("VECTOR_BACKEND=qdrant needs QDRANT_URL")
    if s.llm_backend == "gemini" and not s.gemini_api_key:
        p.append("LLM_BACKEND=gemini needs GEMINI_API_KEY")
    return p
