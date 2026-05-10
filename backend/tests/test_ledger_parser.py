import os
import tempfile

import openpyxl
import pandas as pd
import pytest

from models.schemas import LedgerColumnMapping
from services.ledger_parser import (
    _detect_header_row,
    _detect_sheets,
    _find_col,
    _matches_filter,
    _parse_movement,
    _parse_summary,
    _safe_float,
)

# ── helpers ───────────────────────────────────────────────────────────────────

def _make_excel(sheets: dict) -> tuple:
    """Create a temp xlsx with given sheets {name: list-of-rows}. Returns (ExcelFile, engine, tmp_path)."""
    wb = openpyxl.Workbook()
    first = True
    for sheet_name, rows in sheets.items():
        if first:
            ws = wb.active
            ws.title = sheet_name
            first = False
        else:
            ws = wb.create_sheet(sheet_name)
        for row in rows:
            ws.append(row)
    fd, tmp_path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    wb.save(tmp_path)
    xl = pd.ExcelFile(tmp_path, engine="openpyxl")
    return xl, "openpyxl", tmp_path


# ── _find_col ─────────────────────────────────────────────────────────────────

def test_find_col_exact_match():
    cols = ["전표번호", "공급업체명", "거래금액", "전기일"]
    assert _find_col(cols, ["공급업체명", "거래처명"], 0) == "공급업체명"


def test_find_col_substring_match():
    cols = ["전표번호", "공급업체명_코드", "거래금액", "전기일"]
    assert _find_col(cols, ["공급업체명"], 0) == "공급업체명_코드"


def test_find_col_fallback():
    cols = ["A", "B", "C", "D"]
    result = _find_col(cols, ["없는키워드xyz"], 2)
    assert result == "C"


def test_find_col_fallback_out_of_range():
    cols = ["A", "B"]
    result = _find_col(cols, ["없는키워드xyz"], 99)
    assert result is None


# ── _detect_header_row ────────────────────────────────────────────────────────

def test_detect_header_row_with_korean_keywords():
    rows = [
        [None, None],
        ["전기일", "공급업체명", "거래금액", "증감구분"],
        ["2024-01-01", "ABC Corp", 1000, "증가"],
    ]
    df_raw = pd.DataFrame(rows)
    assert _detect_header_row(df_raw) == 1


def test_detect_header_row_first_row():
    rows = [
        ["날짜", "거래처", "금액"],
        ["2024-01-01", "A", 100],
    ]
    df_raw = pd.DataFrame(rows)
    assert _detect_header_row(df_raw) == 0


# ── _parse_movement alternate column order ────────────────────────────────────

def test_alternate_column_order():
    """D.5.2: 비표준 컬럼 순서 파일도 올바르게 파싱되어야 한다."""
    # Non-standard layout: vendor at col 0, amount at col 1, date at col 2
    rows_movement = [
        ["거래처명", "거래금액", "전기일", "증감구분", "전표적요"],
        ["거래처A", 5000, "2024-03-01", "증가", "매입"],
        ["거래처B", 3000, "2024-03-02", "감소", "반품"],
        ["거래처A", 2000, "2024-03-03", "증가", "추가매입"],
    ]
    xl, engine, tmp_path = _make_excel({"증감": rows_movement})
    try:
        mapping = LedgerColumnMapping(
            vendor_idx=0, amount_idx=1, date_idx=2, type_idx=3, desc_idx=4,
        )
        result, filtered, detected = _parse_movement(xl, "증감", engine, [], mapping)
    finally:
        xl.close()
        os.unlink(tmp_path)

    assert "거래처A" in result
    assert "거래처B" in result
    assert len(result["거래처A"]) == 2
    assert result["거래처A"][0]["amount"] == 5000.0
    assert result["거래처B"][0]["amount"] == 3000.0
    assert detected["vendor"] == "거래처명"
    assert detected["amount"] == "거래금액"
    assert filtered == 0


def test_parse_movement_keyword_detection():
    """컬럼명이 표준 키워드와 정확히 일치하면 자동 감지되어야 한다."""
    rows = [
        ["공급업체명", "금액", "전기일", "증감구분", "적요"],
        ["VendorX", 9999, "2024-06-01", "증가", "구매"],
    ]
    xl, engine, tmp_path = _make_excel({"분개": rows})
    try:
        result, filtered, detected = _parse_movement(xl, "분개", engine, [], None)
    finally:
        xl.close()
        os.unlink(tmp_path)

    assert "VendorX" in result
    assert detected["vendor"] == "공급업체명"
    assert detected["amount"] == "금액"


# ── _parse_summary ────────────────────────────────────────────────────────────

def test_parse_summary_keyword_detection():
    rows = [
        ["계정코드", "계정명", "기초잔액", "당기증가", "당기감소", "기말잔액"],
        ["1001", "현금", 10000, 5000, 3000, 12000],
        ["1002", "매출채권", 20000, 8000, 2000, 26000],
    ]
    xl, engine, tmp_path = _make_excel({"집계": rows})
    try:
        results, filtered = _parse_summary(xl, "집계", engine, [], None)
    finally:
        xl.close()
        os.unlink(tmp_path)

    assert len(results) == 2
    assert results[0]["name"] == "현금"
    assert results[0]["beginning"] == 10000.0
    assert results[1]["ending"] == 26000.0
    assert filtered == 0


def test_parse_summary_with_filters():
    rows = [
        ["계정코드", "계정명", "기초잔액", "당기증가", "당기감소", "기말잔액"],
        ["1001", "현금", 10000, 5000, 3000, 12000],
        ["1002", "매출채권", 20000, 8000, 2000, 26000],
        ["합계", "합계", 30000, 13000, 5000, 38000],
    ]
    xl, engine, tmp_path = _make_excel({"집계": rows})
    filters = [{"code": "1001", "name": ""}]
    try:
        results, filtered = _parse_summary(xl, "집계", engine, filters, None)
    finally:
        xl.close()
        os.unlink(tmp_path)

    assert len(results) == 1
    assert results[0]["code"] == "1001"
    assert filtered == 1  # 매출채권 filtered out; 합계 is skipped by name pattern


# ── _safe_float ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("value,expected", [
    (1000,       1000.0),
    (1000.5,     1000.5),
    ("1500",     1500.0),
    (None,       0.0),
    (float("nan"), 0.0),
    ("abc",      0.0),
    (0,          0.0),
])
def test_safe_float(value, expected):
    assert _safe_float(value) == pytest.approx(expected)


# ── _matches_filter ───────────────────────────────────────────────────────────

def test_matches_filter_no_filter():
    assert _matches_filter("1001_거래처A", []) is True


def test_matches_filter_code_exact():
    filters = [{"code": "1001", "name": ""}]
    assert _matches_filter("1001", filters) is True


def test_matches_filter_code_prefix():
    filters = [{"code": "10", "name": ""}]
    assert _matches_filter("1001_거래처A", filters) is True


def test_matches_filter_name_contains():
    filters = [{"code": "", "name": "거래처A"}]
    assert _matches_filter("국내 거래처A 사업부", filters) is True


def test_matches_filter_no_match():
    filters = [{"code": "9999", "name": "없는거래처"}]
    assert _matches_filter("1001_거래처A", filters) is False


# ── _detect_sheets ────────────────────────────────────────────────────────────

def test_detect_sheets_keywords():
    sheets = ["집계표", "증감분개", "기초잔액", "기말잔액", "기타"]
    result = _detect_sheets(sheets)
    assert result["summary"] == "집계표"
    assert result["movement"] == "증감분개"
    assert result["beginning"] == "기초잔액"
    assert result["ending"] == "기말잔액"


def test_detect_sheets_english():
    sheets = ["summary_2024", "movement_data", "data"]
    result = _detect_sheets(sheets)
    assert result["summary"] == "summary_2024"
    assert result["movement"] == "movement_data"


def test_detect_sheets_no_match():
    sheets = ["Sheet1", "Sheet2"]
    result = _detect_sheets(sheets)
    assert result["summary"] is None
    assert result["movement"] is None
