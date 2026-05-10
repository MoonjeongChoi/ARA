import io
import os
import re
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from models.schemas import (
    DetectedMovementColumns,
    LedgerColumnMapping,
    SummaryColumnMapping,
)

# ── Sheet detection keywords ───────────────────────────────────────────────────
_SUMMARY_KW  = ["집계", "summary", "합계"]
_MOVEMENT_KW = ["증감", "분개", "movement", "변동"]
_BEGINNING_KW = ["기초", "기초잔액", "beginning"]
_ENDING_KW    = ["기말", "기말잔액", "ending"]

# ── Column detection keywords ──────────────────────────────────────────────────
_HEADER_KW = ["거래처", "금액", "날짜", "적요", "계정", "전기일", "공급업체", "전표", "구분", "코드", "date", "amount"]
_VENDOR_KW  = ["공급업체명", "공급업체", "거래처명", "vendor name", "거래처", "vendor", "업체명"]
_AMOUNT_KW  = ["거래금액", "차변금액", "대변금액", "금액", "amount"]
_DATE_KW    = ["전기일", "전표일", "거래일", "날짜", "일자", "date"]
_DESC_KW    = ["전표적요", "거래내역", "적요", "description"]
_TYPE_KW    = ["증감구분", "차대구분", "입출구분", "type"]
_KEY_A_KW   = ["전표유형", "전표번호", "계정번호"]
_KEY_B_KW   = ["세그먼트", "부서코드", "세그", "부서", "사업부"]
_CODE_KW    = ["계정코드", "코드", "account code", "code"]
_NAME_KW    = ["계정명", "품목명", "name"]
_BEGIN_KW   = ["기초잔액", "전기말잔액", "기초", "beginning"]
_INC_KW     = ["당기증가", "기중증가", "증가액", "취득액", "매입액", "증가", "increase"]
_DEC_KW     = ["당기감소", "기중감소", "감소액", "처분액", "매각액", "감소", "decrease"]
_END_KW     = ["기말잔액", "당기말잔액", "기말", "ending"]


def _find_col(cols: List[str], keywords: List[str], default_idx: int) -> Optional[str]:
    """컬럼명 키워드 탐색 (exact → substring 순서). 없으면 default_idx 위치 반환."""
    lower_cols = [str(c).lower() for c in cols]
    # Phase 1: exact match
    for kw in keywords:
        kl = kw.lower()
        for col, lc in zip(cols, lower_cols):
            if kl == lc:
                return col
    # Phase 2: substring match
    for kw in keywords:
        kl = kw.lower()
        for col, lc in zip(cols, lower_cols):
            if kl in lc:
                return col
    if default_idx < len(cols):
        return cols[default_idx]
    return None


def _detect_sheets(sheet_names: List[str]) -> Dict[str, Optional[str]]:
    result: Dict[str, Optional[str]] = {
        "summary": None, "movement": None, "beginning": None, "ending": None
    }
    for name in sheet_names:
        lower = name.lower()
        if result["summary"] is None and any(k in lower for k in _SUMMARY_KW):
            result["summary"] = name
        elif result["movement"] is None and any(k in lower for k in _MOVEMENT_KW):
            result["movement"] = name
        elif result["beginning"] is None and any(k in lower for k in _BEGINNING_KW):
            result["beginning"] = name
        elif result["ending"] is None and any(k in lower for k in _ENDING_KW):
            result["ending"] = name
    return result


def _detect_header_row(df_raw: pd.DataFrame, max_rows: int = 20) -> int:
    limit = min(max_rows, len(df_raw))
    for i in range(limit):
        row = df_raw.iloc[i]
        non_null = row.dropna()
        if len(non_null) == 0:
            continue
        # Primary: Korean financial keyword matching (2+ hits = header)
        row_strs = [str(v).strip().lower() for v in non_null]
        kw_hits = sum(1 for v in row_strs if any(kw in v for kw in _HEADER_KW))
        if kw_hits >= 2:
            return i
        # Fallback: first numeric-heavy row → previous row is header
        num_count = sum(
            1 for v in non_null
            if isinstance(v, (int, float)) and not isinstance(v, bool)
        )
        if num_count / len(non_null) > 0.5:
            for j in range(i - 1, -1, -1):
                if df_raw.iloc[j].dropna().size > 0:
                    return j
            return max(0, i - 1)
    return 0


def _read_sheet(xl: pd.ExcelFile, sheet_name: str, engine: str) -> pd.DataFrame:
    raw = pd.read_excel(xl, sheet_name=sheet_name, header=None, engine=engine)
    header_row = _detect_header_row(raw)
    df = pd.read_excel(xl, sheet_name=sheet_name, header=header_row, engine=engine)
    df.columns = df.columns.astype(str)
    df = df.loc[:, ~df.columns.str.match(r"^Unnamed:")]
    df = df.dropna(axis=1, how="all")
    return df


def _safe_float(v: Any) -> float:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def _matches_filter(value: str, filters: List[Dict[str, str]]) -> bool:
    """Return True when value matches any filter code (prefix) or name (contains)."""
    if not filters:
        return True
    v = str(value).strip()
    for f in filters:
        code = f.get("code", "").strip()
        name = f.get("name", "").strip()
        if code and (v == code or v.startswith(code)):
            return True
        if name and name.lower() in v.lower():
            return True
    return False


def _open_excel(content: bytes, filename: str) -> Tuple[pd.ExcelFile, str, str]:
    ext = Path(filename).suffix.lower()
    engine_map = {".xlsx": "openpyxl", ".xls": "xlrd", ".xlsb": "pyxlsb"}

    if ext == ".zip":
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            excel_names = [n for n in zf.namelist() if Path(n).suffix.lower() in engine_map]
            if not excel_names:
                raise ValueError("ZIP 내에 Excel 파일(.xlsx/.xls/.xlsb)이 없습니다.")
            inner_name = excel_names[0]
            ext = Path(inner_name).suffix.lower()
            content = zf.read(inner_name)

    engine = engine_map.get(ext)
    if not engine:
        raise ValueError(f"지원하지 않는 파일 형식: {ext}")
    fd, tmp_path = tempfile.mkstemp(suffix=ext)
    try:
        os.write(fd, content)
    finally:
        os.close(fd)
    return pd.ExcelFile(tmp_path, engine=engine), engine, tmp_path


def _parse_summary(
    xl: pd.ExcelFile,
    sheet_name: str,
    engine: str,
    filters: List[Dict[str, str]],
    mapping: Optional[SummaryColumnMapping] = None,
) -> Tuple[List[Dict[str, Any]], int]:
    if mapping is None:
        mapping = SummaryColumnMapping()

    df = _read_sheet(xl, sheet_name, engine)
    if len(df.columns) < 6:
        raise ValueError(f"집계표 컬럼 수 부족: {len(df.columns)}개 (최소 6개 필요)")
    c = df.columns.tolist()

    code_c  = _find_col(c, _CODE_KW,  mapping.code_idx)
    name_c  = _find_col(c, _NAME_KW,  mapping.name_idx)
    begin_c = _find_col(c, _BEGIN_KW, mapping.begin_idx)
    inc_c   = _find_col(c, _INC_KW,   mapping.inc_idx)
    dec_c   = _find_col(c, _DEC_KW,   mapping.dec_idx)
    end_c   = _find_col(c, _END_KW,   mapping.end_idx)

    results: List[Dict[str, Any]] = []
    filtered = 0
    for _, row in df.iterrows():
        name = row[name_c] if name_c else None
        if name is None or pd.isna(name) or str(name).strip() == "":
            continue
        name_str = str(name).strip()
        if re.match(r"^(합계|소계|계|total|sum)\s*$", name_str, re.IGNORECASE):
            continue
        code = row[code_c] if code_c else ""
        code_str = str(code).strip() if code_c and not pd.isna(code) else ""
        if not _matches_filter(code_str, filters) and not _matches_filter(name_str, filters):
            filtered += 1
            continue
        results.append({
            "code": code_str,
            "name": name_str,
            "beginning": _safe_float(row[begin_c]) if begin_c else 0.0,
            "increase":  _safe_float(row[inc_c]) if inc_c else 0.0,
            "decrease":  _safe_float(row[dec_c]) if dec_c else 0.0,
            "ending":    _safe_float(row[end_c]) if end_c else 0.0,
        })
    return results, filtered


def _parse_movement(
    xl: pd.ExcelFile,
    sheet_name: str,
    engine: str,
    filters: List[Dict[str, str]],
    mapping: Optional[LedgerColumnMapping] = None,
) -> Tuple[Dict[str, List[Dict[str, Any]]], int, Dict[str, Optional[str]]]:
    if mapping is None:
        mapping = LedgerColumnMapping()

    df = _read_sheet(xl, sheet_name, engine)
    cols = df.columns.tolist()

    vendor_col = _find_col(cols, _VENDOR_KW,  mapping.vendor_idx)
    amount_col = _find_col(cols, _AMOUNT_KW,  mapping.amount_idx)
    date_col   = _find_col(cols, _DATE_KW,    mapping.date_idx)
    desc_col   = _find_col(cols, _DESC_KW,    mapping.desc_idx)
    type_col   = _find_col(cols, _TYPE_KW,    mapping.type_idx)
    key_col_a  = _find_col(cols, _KEY_A_KW,   mapping.key_a_idx)
    key_col_b  = _find_col(cols, _KEY_B_KW,   mapping.key_b_idx)

    detected: Dict[str, Optional[str]] = {
        "vendor": vendor_col, "amount": amount_col,
        "date": date_col, "desc": desc_col, "type": type_col,
    }

    if vendor_col is None or amount_col is None:
        return {}, 0, detected

    result: Dict[str, List[Dict[str, Any]]] = {}
    filtered = 0
    for _, row in df.iterrows():
        vendor = row[vendor_col]
        if pd.isna(vendor) or str(vendor).strip() == "":
            continue
        if filters:
            key_a = str(row[key_col_a]).strip() if key_col_a and not pd.isna(row[key_col_a]) else ""
            key_b = str(row[key_col_b]).strip() if key_col_b and not pd.isna(row[key_col_b]) else ""
            if not (_matches_filter(key_a, filters) or _matches_filter(key_b, filters)):
                filtered += 1
                continue

        vendor_str = str(vendor).strip()
        desc = str(row[desc_col]).strip() if desc_col and not pd.isna(row[desc_col]) else ""
        date_str = ""
        if date_col:
            dv = row[date_col]
            if not pd.isna(dv):
                try:
                    date_str = pd.Timestamp(dv).strftime("%Y-%m-%d")
                except Exception:
                    date_str = str(dv)
        amount = _safe_float(row[amount_col])
        movement_type = str(row[type_col]).strip() if type_col and not pd.isna(row[type_col]) else ""

        result.setdefault(vendor_str, []).append({
            "date": date_str, "description": desc,
            "amount": amount, "type": movement_type,
        })
    return result, filtered, detected


def _parse_extra_file(content: bytes, filename: str) -> Dict[str, Any]:
    ext = Path(filename).suffix.lower()
    base = {"filename": filename, "sheet_names": [], "preview_rows": [], "row_count": 0}
    if ext == ".zip":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                names = [n for n in zf.namelist() if not n.endswith("/")]
            return {**base, "sheet_names": names, "row_count": len(names), "parse_status": "success"}
        except Exception as e:
            return {**base, "parse_status": "failed", "error_message": str(e)}
    elif ext in {".xlsx", ".xls", ".xlsb"}:
        try:
            xl, engine, tmp_path = _open_excel(content, filename)
            try:
                sheet_names: List[str] = xl.sheet_names
                df = _read_sheet(xl, sheet_names[0], engine)
                df = df.head(15).fillna("").astype(str)
                preview = df.to_dict("records")
                return {**base, "sheet_names": sheet_names, "preview_rows": preview, "row_count": len(df), "parse_status": "success"}
            finally:
                xl.close()
                os.unlink(tmp_path)
        except Exception as e:
            return {**base, "parse_status": "failed", "error_message": str(e)}
    else:
        return {**base, "parse_status": "failed", "error_message": f"지원하지 않는 형식: {ext}"}


def _classify_files(
    file_list: List[tuple],
) -> tuple:
    """Auto-classify files as ledger, journal, or extra by inspecting sheet names."""
    engine_map = {".xlsx": "openpyxl", ".xls": "xlrd", ".xlsb": "pyxlsb"}
    ledger: Optional[tuple] = None
    journal: Optional[tuple] = None
    extras: List[tuple] = []

    for content, filename in file_list:
        ext = Path(filename).suffix.lower()
        if ext not in engine_map and ext != ".zip":
            extras.append((content, filename))
            continue
        try:
            xl, engine, tmp_path = _open_excel(content, filename)
            try:
                d = _detect_sheets(xl.sheet_names)
            finally:
                xl.close()
                os.unlink(tmp_path)
        except Exception:
            extras.append((content, filename))
            continue

        if d["summary"] and ledger is None:
            ledger = (content, filename)
        elif d["movement"] and journal is None:
            journal = (content, filename)
        else:
            extras.append((content, filename))

    lc, lf = ledger if ledger else (None, None)
    jc, jf = journal if journal else (None, None)
    return lc, lf, jc, jf, extras


def process_files(
    file_list: List[tuple],
    account_filters: Optional[List[Dict[str, str]]] = None,
    col_mapping: Optional[LedgerColumnMapping] = None,
    sum_mapping: Optional[SummaryColumnMapping] = None,
) -> Dict[str, Any]:
    lc, lf, jc, jf, extras = _classify_files(file_list)
    return process_ledger(lc, lf, jc, jf, account_filters, extras, col_mapping, sum_mapping)


def process_ledger(
    ledger_content: Optional[bytes],
    ledger_filename: Optional[str],
    journal_content: Optional[bytes],
    journal_filename: Optional[str],
    account_filters: Optional[List[Dict[str, str]]] = None,
    extra_file_contents: Optional[List[tuple]] = None,
    col_mapping: Optional[LedgerColumnMapping] = None,
    sum_mapping: Optional[SummaryColumnMapping] = None,
) -> Dict[str, Any]:
    filters = account_filters or []
    warnings: List[str] = []
    summary: List[Dict[str, Any]] = []
    journal_by_vendor: Dict[str, List[Dict[str, Any]]] = {}
    has_ledger = False
    has_journal = False
    filtered_out = 0
    detected: Dict[str, Any] = {
        "summary": None, "movement": None,
        "beginning": None, "ending": None, "all_sheets": [],
    }
    detected_mv_cols: Optional[Dict[str, Optional[str]]] = None

    # ── 명세서 파일 ────────────────────────────────────────────────────────────
    if ledger_content and ledger_filename:
        has_ledger = True
        xl, engine, tmp_path = _open_excel(ledger_content, ledger_filename)
        try:
            sheet_names: List[str] = xl.sheet_names
            d = _detect_sheets(sheet_names)
            detected.update(d)
            detected["all_sheets"] = sheet_names

            if d["summary"]:
                try:
                    summary, fo = _parse_summary(xl, d["summary"], engine, filters, sum_mapping)
                    filtered_out += fo
                except Exception as e:
                    warnings.append(f"집계표 파싱 오류: {e}")
            else:
                warnings.append("집계표 시트를 자동 감지하지 못했습니다.")

            if not journal_content and d["movement"]:
                try:
                    journal_by_vendor, fo, detected_mv_cols = _parse_movement(
                        xl, d["movement"], engine, filters, col_mapping
                    )
                    filtered_out += fo
                    has_journal = bool(journal_by_vendor)
                except Exception as e:
                    warnings.append(f"증감 파싱 오류: {e}")
            xl.close()
        finally:
            os.unlink(tmp_path)

    # ── 분개장 파일 ────────────────────────────────────────────────────────────
    if journal_content and journal_filename:
        xl, engine, tmp_path = _open_excel(journal_content, journal_filename)
        try:
            sheet_names = xl.sheet_names
            d = _detect_sheets(sheet_names)
            if not detected["all_sheets"]:
                detected["all_sheets"] = sheet_names
            movement_sheet = d.get("movement") or (sheet_names[0] if sheet_names else None)
            if movement_sheet:
                detected["movement"] = movement_sheet
                try:
                    journal_by_vendor, fo, detected_mv_cols = _parse_movement(
                        xl, movement_sheet, engine, filters, col_mapping
                    )
                    filtered_out += fo
                    has_journal = bool(journal_by_vendor)
                except Exception as e:
                    warnings.append(f"분개장 파싱 오류: {e}")
            else:
                warnings.append("분개장에서 데이터 시트를 감지하지 못했습니다.")
            xl.close()
        finally:
            os.unlink(tmp_path)

    applied_filters = [
        f.get("code") or f.get("name", "")
        for f in filters if f.get("code") or f.get("name")
    ]
    total_journal = sum(len(v) for v in journal_by_vendor.values())

    extra_files = []
    for (ef_content, ef_filename) in (extra_file_contents or []):
        extra_files.append(_parse_extra_file(ef_content, ef_filename))

    return {
        "has_ledger": has_ledger,
        "has_journal": has_journal,
        "summary": summary,
        "journal_by_vendor": journal_by_vendor,
        "detected_sheets": {
            "summary":   detected["summary"],
            "movement":  detected["movement"],
            "beginning": detected.get("beginning"),
            "ending":    detected.get("ending"),
            "all_sheets": detected["all_sheets"],
        },
        "total_vendors": len(journal_by_vendor),
        "total_journal_entries": total_journal,
        "applied_filters": applied_filters,
        "filtered_out_count": filtered_out,
        "parse_warnings": warnings,
        "extra_files": extra_files,
        "detected_movement_columns": detected_mv_cols,
    }
