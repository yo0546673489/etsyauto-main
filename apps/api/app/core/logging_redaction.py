import logging
from typing import Any

from app.core.redaction import scrub_sensitive_data, scrub_string


class LogRedactionFilter(logging.Filter):
    """
    Redact secrets from log messages and arguments.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = _scrub_value(record.msg)
        if record.args:
            record.args = _scrub_value(record.args)
        return True


def _scrub_value(value: Any) -> Any:
    if isinstance(value, str):
        return scrub_string(value)
    if isinstance(value, dict):
        return scrub_sensitive_data(value)
    if isinstance(value, list):
        return [scrub_sensitive_data(item) if isinstance(item, dict) else _scrub_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_scrub_value(item) for item in value)
    return value


def setup_log_redaction() -> None:
    """
    Attach redaction filter to root and common server loggers.
    """
    filter_instance = LogRedactionFilter()
    loggers = [
        logging.getLogger(),
        logging.getLogger("uvicorn"),
        logging.getLogger("uvicorn.error"),
        logging.getLogger("uvicorn.access"),
        logging.getLogger("gunicorn"),
        logging.getLogger("fastapi"),
    ]

    for logger in loggers:
        logger.addFilter(filter_instance)

    # Suppress verbose SQLAlchemy logs (connection pool, SQL echo, etc.)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.orm").setLevel(logging.WARNING)
