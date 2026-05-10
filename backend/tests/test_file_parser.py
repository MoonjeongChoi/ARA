import pandas as pd
import pytest

from services.file_parser import _get_suggested_columns, detect_date_from_filename, infer_file_unit

# ── detect_date_from_filename ─────────────────────────────────────────────────

@pytest.mark.parametrize("filename,expected", [
    # daily patterns
    ("분개장_2024-03-15.xlsx", "2024-03-15"),
    ("분개장_2024_03_15.xlsx", "2024-03-15"),
    ("20240315_data.xlsx",     "2024-03-15"),
    # monthly patterns
    ("분개장_2024-03.xlsx",    "2024-03"),
    ("분개장_2024_03.xlsx",    "2024-03"),
    ("202403_data.xlsx",       "2024-03"),
    # no date
    ("분개장.xlsx",             None),
    ("data.xlsx",               None),
    # invalid month/day
    ("20241399.xlsx",           None),
])
def test_detect_date_from_filename(filename: str, expected):
    assert detect_date_from_filename(filename) == expected


# ── infer_file_unit ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("count,expected", [
    (0,  "unknown"),
    (1,  "monthly"),
    (12, "monthly"),
    (13, "monthly"),
    (14, "unknown"),
    (27, "unknown"),
    (28, "daily"),
    (31, "daily"),
    (365, "daily"),
])
def test_infer_file_unit(count: int, expected: str):
    assert infer_file_unit(count) == expected


# ── _get_suggested_columns ────────────────────────────────────────────────────

def test_get_suggested_columns_numeric_and_date():
    df = pd.DataFrame({
        "금액": [100.0, 200.0, 300.0],
        "날짜": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]),
        "이름": ["A", "B", "C"],
    })
    amount_cols, date_cols = _get_suggested_columns([df])
    assert "금액" in amount_cols
    assert "날짜" in date_cols
    assert "이름" not in amount_cols
    assert "이름" not in date_cols


def test_get_suggested_columns_empty():
    amount_cols, date_cols = _get_suggested_columns([])
    assert amount_cols == []
    assert date_cols == []
