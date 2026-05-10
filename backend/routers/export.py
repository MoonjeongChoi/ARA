import logging
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from models.schemas import ExportRequest
from services.excel_exporter import build_excel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/export", tags=["export"])


@router.post("/excel")
async def export_excel(request: ExportRequest) -> Response:
    try:
        content = build_excel(request.project, request.accounts)
    except Exception:
        logger.exception("Excel 생성 실패")
        raise HTTPException(status_code=500, detail="Excel 파일 생성 중 오류가 발생했습니다.")

    company = request.project.companyName
    year    = request.project.fiscalYear
    today   = datetime.now().strftime("%Y%m%d")
    filename = f"{company}_{year}_분석적검토_{today}.xlsx"

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"
        },
    )
