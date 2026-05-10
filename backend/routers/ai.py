import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.genai_client import genai_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

SYSTEM_PROMPT = """당신은 회계감사 전문가입니다.

## 문체 규칙
모든 문장은 반드시 명사형 종결어미로 끝낼 것. "~했다", "~이다", "~된다", "~보인다" 형태 사용 금지.
대신 "~함", "~임", "~됨", "~으로 판단됨", "~으로 추정됨", "~에 기인함" 등을 사용할 것.
예) "매출채권이 증가했다" → "매출채권이 증가함" / "신규 거래처가 추가되었다" → "신규 거래처가 추가됨"
"""

MAX_TOKENS = 16384


class AnalysisPeriod(BaseModel):
    start: str
    end: str


class ComponentRow(BaseModel):
    name: str
    priorAmount: Optional[float] = None
    currentAmount: Optional[float] = None
    isIndividual: bool = True
    isChecked: bool = True


class ExtraFile(BaseModel):
    filename: str
    sheet_names: List[str] = []
    preview_rows: List[Dict[str, str]] = []
    parse_status: str = "success"
    error_message: Optional[str] = None


class AnalyzeRequest(BaseModel):
    accountName: str
    accountType: str
    analysisMode: str
    components: List[ComponentRow] = []
    materialityAmount: Optional[float] = None
    analysisPeriod: Optional[AnalysisPeriod] = None
    journalByVendor: Dict[str, List[Dict[str, Any]]] = {}
    auditorInstruction: str = ""
    extraFiles: List[ExtraFile] = []


def _fmt(v: Any) -> str:
    if v is None:
        return "-"
    try:
        return f"{float(v):,.0f}"
    except (TypeError, ValueError):
        return "-"


def _delta_rate(prior: Optional[float], current: Optional[float]):
    if current is None or prior is None:
        return None, "N/A"
    delta = current - prior
    if prior != 0:
        rate = f"{delta / abs(prior) * 100:.1f}%"
    else:
        rate = "신규"
    return delta, rate


def _build_extra_files_section(extra_files: List[ExtraFile]) -> str:
    blocks = []
    for f in extra_files:
        if f.parse_status != "success" or not f.preview_rows:
            continue
        cols = " | ".join(f.preview_rows[0].keys())
        rows = "\n".join(" | ".join(r.values()) for r in f.preview_rows[:5])
        blocks.append(f"### {f.filename}\n시트: {', '.join(f.sheet_names)}\n컬럼: {cols}\n\n{rows}")
    if not blocks:
        return ""
    return "\n## 기타 참고 자료\n" + "\n\n".join(blocks) + "\n"


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    is_instruction_mode = req.analysisMode == "manual_define" and bool(req.auditorInstruction)

    if not is_instruction_mode and not req.components:
        raise HTTPException(status_code=400, detail="구성요소가 없습니다.")

    period_str = (
        f"{req.analysisPeriod.start} ~ {req.analysisPeriod.end}"
        if req.analysisPeriod else "기간 미지정"
    )
    mat_str = f"{int(req.materialityAmount):,}천원" if req.materialityAmount else "미지정"
    extra_files_section = _build_extra_files_section(req.extraFiles)

    # ── Instruction mode: single call ──────────────────────────────────────
    if is_instruction_mode:
        all_entries: List[Dict[str, Any]] = []
        for vendor, entries in req.journalByVendor.items():
            for e in entries:
                all_entries.append({**e, "vendor": vendor})
        top_entries = sorted(all_entries, key=lambda x: abs(x.get("amount", 0) or 0), reverse=True)[:30]

        if top_entries:
            journal_lines = "\n".join(
                f"{i+1}. [{e['vendor']}] {e.get('description') or '(적요 없음)'} / {e.get('date') or '날짜 미상'} / {_fmt(e.get('amount'))}천원"
                for i, e in enumerate(top_entries)
            )
            journal_block = f"\n## 분개 내역 (금액 기준 상위 {len(top_entries)}건)\n{journal_lines}\n"
        else:
            journal_block = ""

        user_prompt = f"""아래 계정과목의 분석 구성요소를 생성하고 기초/기말잔액과 증감 분석 사유를 작성해 주세요.

## 감사 정보
- 계정과목: {req.accountName} ({req.accountType})
- 분석 기간: {period_str}
- 중요성 금액: {mat_str}

## 감사인 분석 지시
{req.auditorInstruction}
{journal_block}{extra_files_section}
## 요청 사항
다음 JSON 형식으로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만 출력하세요:
{{
  "summary": "감사인 지시 기반 분석적 절차 요약 (3~5문장, 주요 증감 원인, 위험 요소, 감사 의견)",
  "components": [
    {{ "name": "구성요소명", "beginning": 0, "ending": 0, "reason": "해당 구성요소의 증감 분석 사유 (최대 200자)" }}
  ]
}}"""

        try:
            result = await genai_client.complete_json(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=0.1,
                max_tokens=MAX_TOKENS,
            )
            return result
        except Exception as e:
            logger.error("AI analyze (instruction) failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail="AI 분석 중 오류가 발생했습니다.")

    # ── Normal mode: two parallel calls ────────────────────────────────────
    mode_label = "잔액 자동 필터" if req.analysisMode == "auto_filter" else "구성요소 직접 정의"
    checked = [c for c in req.components if c.isChecked]

    # Aggregate totals across ALL components
    total_prior = sum(c.priorAmount or 0 for c in req.components)
    total_current = sum(c.currentAmount or 0 for c in req.components)
    total_delta = total_current - total_prior
    total_rate = f"{total_delta / abs(total_prior) * 100:.1f}%" if total_prior != 0 else "신규"

    # Checked items overview (for summary context)
    checked_rows = "\n".join(
        f"| {c.name} | {'개별' if c.isIndividual else '합산'} | {_fmt(c.priorAmount)} | {_fmt(c.currentAmount)} | {_fmt(_delta_rate(c.priorAmount, c.currentAmount)[0])} | {_delta_rate(c.priorAmount, c.currentAmount)[1]} |"
        for c in checked
    ) or "| (없음) | - | - | - | - | - |"

    # ── Prompt 1: summary from aggregate totals ──
    summary_prompt = f"""아래 계정과목의 전체 잔액 기준 분석적 절차 요약을 작성해 주세요.

## 감사 정보
- 계정과목: {req.accountName} ({req.accountType})
- 분석 모드: {mode_label}
- 분석 기간: {period_str}
- 중요성 금액: {mat_str}
- 구성요소 수: {len(req.components)}개 (분석 대상: {len(checked)}개)

## 전체 합계 (단위: 천원)
| 전기 합계 | 당기 합계 | 증감액 | 증감률 |
|---------|---------|--------|--------|
| {_fmt(total_prior)} | {_fmt(total_current)} | {_fmt(total_delta)} | {total_rate} |

## 분석 대상 구성요소 개요 (단위: 천원)
| 구성요소 | 구분 | 전기 | 당기 | 증감액 | 증감률 |
|---------|------|------|------|--------|--------|
{checked_rows}
{extra_files_section}
## 요청 사항
다음 JSON 형식으로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만 출력하세요:
{{
  "summary": "계정과목 전체에 대한 분석적 절차 요약 (3~5문장, 주요 증감 원인, 위험 요소, 감사 의견)"
}}"""

    # ── Prompt 2: individual reasons for checked items only ──
    reasons_blocks = []
    for c in checked:
        delta, rate = _delta_rate(c.priorAmount, c.currentAmount)
        entries = req.journalByVendor.get(c.name, []) if c.isIndividual else []
        top3 = sorted(entries, key=lambda x: abs(x.get("amount", 0) or 0), reverse=True)[:3]
        journal_part = ""
        if top3:
            lines = "\n".join(
                f"  {i+1}. {e.get('description') or '(적요 없음)'} / {e.get('date') or '날짜 미상'} / {_fmt(e.get('amount'))}천원"
                for i, e in enumerate(top3)
            )
            journal_part = f"\n  주요 분개 (상위 3건):\n{lines}"
        reasons_blocks.append(
            f"- {c.name}: 전기 {_fmt(c.priorAmount)} → 당기 {_fmt(c.currentAmount)}, 증감 {_fmt(delta)}천원 ({rate}){journal_part}"
        )

    reasons_data = "\n".join(reasons_blocks) if reasons_blocks else "(분석 대상 없음)"

    reasons_prompt = f"""아래 계정과목의 구성요소별 증감 분석 사유를 작성해 주세요.

## 감사 정보
- 계정과목: {req.accountName} ({req.accountType})
- 분석 기간: {period_str}

## 분석 대상 구성요소 (단위: 천원)
{reasons_data}

## 요청 사항
각 구성요소의 증감 원인을 1~2문장(최대 200자)으로 작성하세요.
다음 JSON 형식으로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만 출력하세요:
{{
  "components": [
    {{ "name": "구성요소명", "reason": "증감 분석 사유 (최대 200자)" }}
  ]
}}"""

    try:
        summary_result, reasons_result = await asyncio.gather(
            genai_client.complete_json(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=summary_prompt,
                temperature=0.1,
                max_tokens=MAX_TOKENS,
            ),
            genai_client.complete_json(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=reasons_prompt,
                temperature=0.1,
                max_tokens=MAX_TOKENS,
            ),
        )
        return {
            "summary": summary_result.get("summary", ""),
            "components": reasons_result.get("components", []),
        }
    except Exception as e:
        logger.error("AI analyze failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="AI 분석 중 오류가 발생했습니다.")
