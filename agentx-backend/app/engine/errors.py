class TaskStopped(Exception):
    """The user rejected an approval or the task was cancelled. Not an error."""


class NodeFailed(Exception):
    """A step failed after all retries."""


class BudgetExceeded(Exception):
    """The task's token budget was reached. Not retried."""


class ToolError(Exception):
    """A tool returned nothing usable. Retried with a different strategy."""
