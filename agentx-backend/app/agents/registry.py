from .analyst import Analyst
from .executor import Executor
from .planner import Planner
from .researcher import Researcher
from .reviewer import Reviewer
from .supervisor import Supervisor
from .writer import Writer

REGISTRY = {a.id: a for a in (Supervisor(), Planner(), Researcher(), Analyst(), Executor(), Writer(), Reviewer())}
