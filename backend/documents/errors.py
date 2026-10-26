"""Failures that survive metadata and editor operation boundaries."""

UNAVAILABLE = "RemDo is unavailable. Try again later."


class OperationError(Exception):
    def __init__(self, code, message, *, reconnect=False):
        super().__init__(message)
        self.code = code
        self.reconnect = reconnect
