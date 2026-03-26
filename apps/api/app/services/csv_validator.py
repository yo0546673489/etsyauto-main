"""
CSV Schema Validation & Sanitization Service

Provides:
- Required-column enforcement
- Per-row validation (non-empty required fields, numeric parsing)
- Formula injection prevention (strip leading =, +, -, @, tab, carriage return)
- HTML tag stripping from text fields
"""
import csv
import io
import re
from typing import Dict, List, Optional, Tuple

# Characters that trigger formula execution in spreadsheet apps
_FORMULA_CHARS = {"=", "+", "-", "@", "\t", "\r"}

_HTML_TAG_RE = re.compile(r"<[^>]+>")

# Columns that must exist and be non-empty for every row
REQUIRED_COLUMNS = {"title"}

# Columns where the value is expected to be numeric
NUMERIC_COLUMNS = {"price", "quantity"}


def sanitize_cell(value: str) -> str:
    """
    Sanitize a single CSV cell value:
    1. Strip leading formula-injection characters
    2. Strip HTML tags
    3. Strip leading/trailing whitespace
    """
    if not value:
        return value

    # Strip leading formula chars (may be chained, e.g. "=+cmd")
    while value and value[0] in _FORMULA_CHARS:
        value = value[1:]

    # Remove HTML tags
    value = _HTML_TAG_RE.sub("", value)

    return value.strip()


def validate_and_sanitize_csv(
    csv_text: str,
    required_columns: Optional[set] = None,
    numeric_columns: Optional[set] = None,
) -> Tuple[List[Dict[str, str]], List[Dict]]:
    """
    Parse, validate, and sanitize CSV text.

    Parameters
    ----------
    csv_text : str
        Raw UTF-8 CSV content.
    required_columns : set, optional
        Column names that must be present and non-empty.
        Defaults to ``REQUIRED_COLUMNS``.
    numeric_columns : set, optional
        Column names expected to parse as numbers.
        Defaults to ``NUMERIC_COLUMNS``.

    Returns
    -------
    (rows, errors)
        rows  – list of sanitized row dicts (only valid rows)
        errors – list of ``{"row": int, "column": str, "message": str}``
    """
    if required_columns is None:
        required_columns = REQUIRED_COLUMNS
    if numeric_columns is None:
        numeric_columns = NUMERIC_COLUMNS

    reader = csv.DictReader(io.StringIO(csv_text))

    # --- Column-level check ---
    errors: List[Dict] = []
    if reader.fieldnames is None:
        errors.append({"row": 0, "column": "", "message": "CSV has no header row"})
        return [], errors

    header_set = {(f or "").strip().lower() for f in reader.fieldnames}
    missing = required_columns - header_set
    if missing:
        errors.append({
            "row": 0,
            "column": ", ".join(sorted(missing)),
            "message": f"Missing required column(s): {', '.join(sorted(missing))}",
        })
        return [], errors

    valid_rows: List[Dict[str, str]] = []

    for row_idx, raw_row in enumerate(reader, start=2):  # row 1 = header
        row_errors: List[Dict] = []
        sanitized: Dict[str, str] = {}

        for col, value in raw_row.items():
            if col is None:
                continue
            col_lower = col.strip().lower()
            clean = sanitize_cell(value or "")
            sanitized[col_lower] = clean

            # Required-field check
            if col_lower in required_columns and not clean:
                row_errors.append({
                    "row": row_idx,
                    "column": col_lower,
                    "message": f"Required column '{col_lower}' is empty",
                })

            # Numeric-field check
            if col_lower in numeric_columns and clean:
                try:
                    float(clean)
                except ValueError:
                    row_errors.append({
                        "row": row_idx,
                        "column": col_lower,
                        "message": f"Column '{col_lower}' must be numeric, got '{clean}'",
                    })

        if row_errors:
            errors.extend(row_errors)
        else:
            valid_rows.append(sanitized)

    return valid_rows, errors
