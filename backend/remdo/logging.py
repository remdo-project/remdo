import json
import logging
from pathlib import Path
from traceback import walk_tb


class RequestErrorFormatter(logging.Formatter):
    def format(self, record):
        diagnostic = {
            "logger": record.name,
            "level": record.levelname,
        }
        if hasattr(record, "status_code"):
            diagnostic["status"] = record.status_code
        if record.exc_info:
            exception_type, _, traceback = record.exc_info
            diagnostic["exception"] = exception_type.__name__
            diagnostic["frames"] = [
                {
                    "file": Path(frame.f_code.co_filename).name,
                    "function": frame.f_code.co_name,
                    "line": line,
                }
                for frame, line in walk_tb(traceback)
            ]
        return json.dumps(diagnostic)
