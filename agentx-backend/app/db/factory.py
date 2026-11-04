from ..config import Settings
from .base import Database


def make_database(s: Settings) -> Database:
    if s.db_backend == "mongo":
        from .mongo_db import MongoDatabase

        return MongoDatabase(s.mongo_url, s.mongo_db)
    from .memory_db import MemoryDatabase

    return MemoryDatabase()
