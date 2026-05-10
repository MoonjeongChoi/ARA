import os
import re
import time
import uuid
import zipfile
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

SESSION_TTL = 1800       # 30분 무사용 시 만료
MAX_FILES_IN_ZIP = 100   # zip bomb 방어

# In-memory session store: session_id -> (DataFrame, last_access_timestamp)
_sessions: Dict[str, Tuple[pd.DataFrame, float]] = {}


def _cleanup_expired_sessions() -> None:
    now = time.time()
    expired = [k for k, (_, ts) in _sessions.items() if now - ts > SESSION_TTL]
    for k in expired:
        del _sessions[k]


def get_session(session_id: str) -> Optional[pd.DataFrame]:
    _cleanup_expired_sessions()
    entry = _sessions.get(session_id)
    if entry is None:
        return None
    df, _ = entry
    _sessions[session_id] = (df, time.time())  # TTL 갱신
    return df


def store_session(session_id: str, df: pd.DataFrame) -> None:
    _cleanup_expired_sessions()
    _sessions[session_id] = (df, time.time())


def detect_date_from_filename(filename: str) -> Optional[str]:
    """Extract date string from filename. Returns YYYY-MM-DD (daily) or YYYY-MM (monthly)."""
    stem = Path(filename).stem

    # 1. YYYY-MM-DD or YYYY_MM_DD (separator-delimited daily)
    m = re.search(r"(\d{4})[_\-](\d{2})[_\-](\d{2})(?!\d)", stem)
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        try:
            datetime(int(y), int(mo), int(d))
            return f"{y}-{mo}-{d}"
        except ValueError:
            pass

    # 2. YYYYMMDD (8 consecutive digits)
    m = re.search(r"(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)", stem)
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        try:
            datetime(int(y), int(mo), int(d))
            return f"{y}-{mo}-{d}"
        except ValueError:
            pass

    # 3. YYYY-MM or YYYY_MM (separator-delimited monthly)
    m = re.search(r"(\d{4})[_\-](\d{2})(?![_\-\d])", stem)
    if m:
        y, mo = m.group(1), m.group(2)
        try:
            datetime(int(y), int(mo), 1)
            return f"{y}-{mo}"
        except ValueError:
            pass

    # 4. YYYYMM (6 consecutive digits)
    m = re.search(r"(?<!\d)(\d{4})(\d{2})(?!\d)", stem)
    if m:
        y, mo = m.group(1), m.group(2)
        try:
            datetime(int(y), int(mo), 1)
            return f"{y}-{mo}"
        except ValueError:
            pass

    return None


def infer_file_unit(file_count: int) -> str:
    if file_count == 0:
        return "unknown"
    if file_count <= 13:
        return "monthly"
    if file_count >= 28:
        return "daily"
    return "unknown"


def _parse_single_file(file_path: str, filename: str) -> Tuple[Optional[pd.DataFrame], Dict[str, Any]]:
    """Parse one Excel file. Returns (DataFrame or None, metadata dict)."""
    ext = Path(filename).suffix.lower()
    meta: Dict[str, Any] = {
        "filename": filename,
        "detected_date": detect_date_from_filename(filename),
        "columns": [],
        "row_count": 0,
        "parse_status": "failed",
        "error_message": None,
    }

    try:
        if ext == ".xlsx":
            df = pd.read_excel(file_path, engine="openpyxl", header=0)
        elif ext == ".xls":
            df = pd.read_excel(file_path, engine="xlrd", header=0)
        elif ext == ".xlsb":
            df = pd.read_excel(file_path, engine="pyxlsb", header=0)
        else:
            meta["error_message"] = f"지원하지 않는 형식: {ext}"
            return None, meta

        df.columns = df.columns.astype(str)
        df = df.loc[:, ~df.columns.str.match(r"^Unnamed:")]
        df = df.dropna(axis=1, how="all")
        meta["columns"] = list(df.columns)
        meta["row_count"] = len(df)
        meta["parse_status"] = "success"
        return df, meta

    except Exception as exc:
        meta["error_message"] = str(exc)
        return None, meta


def _get_suggested_columns(dfs: List[pd.DataFrame]) -> Tuple[List[str], List[str]]:
    """Return (amount_column_candidates, date_column_candidates) from the first parsed DataFrame."""
    if not dfs:
        return [], []
    df = dfs[0]
    amount_cols: List[str] = []
    date_cols: List[str] = []
    for col in df.columns:
        dtype_str = str(df[col].dtype)
        if dtype_str in ("float64", "int64", "float32", "int32"):
            amount_cols.append(col)
        elif "datetime" in dtype_str:
            date_cols.append(col)
    return amount_cols, date_cols


def process_zip(zip_content: bytes) -> Dict[str, Any]:
    """
    Extract a ZIP, parse all Excel files in parallel, and return metadata + session_id.
    Temporary files are cleaned up automatically via TemporaryDirectory.
    """
    session_id = str(uuid.uuid4())
    valid_exts = {".xlsx", ".xls", ".xlsb"}

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        zip_path = tmpdir_path / "upload.zip"
        zip_path.write_bytes(zip_content)

        extract_dir = tmpdir_path / "extracted"
        extract_dir.mkdir()

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                eligible = [
                    e for e in zf.namelist()
                    if (
                        Path(Path(e).name).suffix.lower() in valid_exts
                        and not Path(e).name.startswith("~$")
                        and not Path(e).name.startswith(".")
                        and "__MACOSX" not in e
                        and Path(e).name
                    )
                ]
                if len(eligible) > MAX_FILES_IN_ZIP:
                    raise ValueError(f"ZIP 내 파일이 너무 많습니다 (최대 {MAX_FILES_IN_ZIP}개).")
                for entry in eligible:
                    zf.extract(entry, extract_dir)
        except zipfile.BadZipFile:
            raise ValueError("올바른 ZIP 파일이 아닙니다.")

        # Walk extracted directory to collect all Excel files
        tasks: List[Tuple[str, str]] = []
        for root, _, files in os.walk(extract_dir):
            for f in sorted(files):
                if Path(f).suffix.lower() in valid_exts and not f.startswith("~$"):
                    tasks.append((os.path.join(root, f), f))

        file_count = len(tasks)
        file_unit = infer_file_unit(file_count)

        parsed_files: List[Dict[str, Any]] = []
        dataframes: List[pd.DataFrame] = []
        parse_errors: List[str] = []

        max_workers = min(8, file_count) if file_count > 0 else 1
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_map = {
                executor.submit(_parse_single_file, path, fname): fname
                for path, fname in tasks
            }
            for future in as_completed(future_map):
                df, meta = future.result()
                parsed_files.append(meta)
                if df is not None:
                    dataframes.append(df)
                if meta["parse_status"] == "failed":
                    parse_errors.append(
                        f"{meta['filename']}: {meta.get('error_message', 'Unknown error')}"
                    )

        parsed_files.sort(key=lambda x: x["filename"])
        amount_cols, date_cols = _get_suggested_columns(dataframes)

        if dataframes:
            combined = pd.concat(dataframes, ignore_index=True)
            store_session(session_id, combined)

    return {
        "session_id": session_id,
        "file_unit": file_unit,
        "file_count": file_count,
        "files": parsed_files,
        "parse_errors": parse_errors,
        "suggested_amount_columns": amount_cols,
        "suggested_date_columns": date_cols,
    }


def aggregate_data(
    session_id: str,
    amount_column: str,
    group_column: Optional[str],
    date_column: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
    materiality_amount: Optional[float],
) -> Dict[str, Any]:
    df = get_session(session_id)
    if df is None:
        raise ValueError(f"세션을 찾을 수 없습니다: {session_id}")

    df = df.copy()

    # Date filtering
    if date_column and date_column in df.columns and (start_date or end_date):
        df[date_column] = pd.to_datetime(df[date_column], errors="coerce")
        if start_date:
            df = df[df[date_column] >= pd.Timestamp(start_date)]
        if end_date:
            df = df[df[date_column] <= pd.Timestamp(end_date)]

    period_str = f"{start_date or '전체'} ~ {end_date or '전체'}"

    if amount_column not in df.columns:
        raise ValueError(f"컬럼을 찾을 수 없습니다: {amount_column}")

    df[amount_column] = pd.to_numeric(df[amount_column], errors="coerce").fillna(0)
    total = float(df[amount_column].sum())

    items: List[Dict[str, Any]] = []

    if group_column and group_column in df.columns:
        grouped = (
            df.groupby(group_column, as_index=False)[amount_column]
            .sum()
            .rename(columns={group_column: "name", amount_column: "amount"})
            .sort_values("amount", ascending=False)
        )

        if materiality_amount is not None:
            above = grouped[grouped["amount"] >= materiality_amount]
            below = grouped[grouped["amount"] < materiality_amount]

            for _, row in above.iterrows():
                items.append({"name": str(row["name"]), "amount": float(row["amount"]), "is_individual": True})

            if not below.empty:
                items.append({"name": "기타", "amount": float(below["amount"].sum()), "is_individual": False})
        else:
            for _, row in grouped.iterrows():
                items.append({"name": str(row["name"]), "amount": float(row["amount"]), "is_individual": True})
    else:
        items.append({"name": "전체 합계", "amount": total, "is_individual": True})

    return {"total": total, "analysis_period": period_str, "items": items}
