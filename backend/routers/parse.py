import json
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from models.schemas import (
    AggregateRequest, AggregateResponse, LedgerParseResponse, ZipParseResponse,
)
from services.file_parser import aggregate_data, process_zip
from services.ledger_parser import process_files

router = APIRouter(prefix="/api/parse", tags=["parse"])

_ALL_EXTS = {".xlsx", ".xls", ".xlsb", ".zip"}


@router.post("/zip", response_model=ZipParseResponse)
async def parse_zip_upload(file: UploadFile = File(...)):
    filename = file.filename or ""
    if not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="ZIP 파일만 업로드 가능합니다.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="파일이 비어 있습니다.")
    try:
        result = process_zip(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파싱 중 오류가 발생했습니다: {e}")
    return result


@router.post("/ledger", response_model=LedgerParseResponse)
async def parse_ledger_upload(
    files: List[UploadFile] = File(default=[]),
    account_filters: str = Form("[]"),
):
    if not any(f.filename for f in files):
        raise HTTPException(status_code=400, detail="파일을 하나 이상 업로드하세요.")

    try:
        filters = json.loads(account_filters)
        if not isinstance(filters, list):
            filters = []
    except (json.JSONDecodeError, TypeError):
        filters = []

    file_contents = []
    for f in files:
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext not in _ALL_EXTS:
            continue
        file_contents.append((await f.read(), f.filename))

    if not file_contents:
        raise HTTPException(status_code=400, detail="xlsx / xls / xlsb / zip 파일만 가능합니다.")

    try:
        result = process_files(file_contents, filters)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파싱 중 오류가 발생했습니다: {e}")

    return result


@router.post("/aggregate", response_model=AggregateResponse)
async def aggregate(request: AggregateRequest):
    try:
        result = aggregate_data(
            session_id=request.zip_session_id,
            amount_column=request.amount_column,
            group_column=request.group_column,
            date_column=request.date_column,
            start_date=request.start_date,
            end_date=request.end_date,
            materiality_amount=request.materiality_amount,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"집계 중 오류가 발생했습니다: {e}")
    return result
