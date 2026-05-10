import asyncio
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from jinja2 import Environment, FileSystemLoader
from pydantic import BaseModel

from services.genai_client import genai_client, settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])

_PROMPTS_DIR = Path(__file__).parent.parent / "services" / "prompts"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_PROMPTS_DIR)),
    autoescape=False,
    keep_trailing_newline=True,
)
SYSTEM_PROMPT: str = (_PROMPTS_DIR / "system.md").read_text(encoding="utf-8")


def _render(template_name: str, **ctx) -> str:
    return _jinja_env.get_template(template_name).render(**ctx)


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

        user_prompt = _render(
            "analyze_instruction.md.j2",
            account_name=req.accountName,
            account_type=req.accountType,
            period_str=period_str,
            mat_str=mat_str,
            auditor_instruction=req.auditorInstruction,
            journal_block=journal_block,
            extra_files_section=extra_files_section,
        )

        try:
            result = await genai_client.complete_json(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=settings.GENAI_TEMPERATURE,
                max_tokens=settings.GENAI_MAX_TOKENS,
            )
            return result
        except Exception as e:
            logger.error("AI analyze (instruction) failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail="AI 분석 중 오류가 발생했습니다.")

    # ── Normal mode: two parallel calls ────────────────────────────────────
    mode_label = "잔액 자동 필터" if req.analysisMode == "auto_filter" else "구성요소 직접 정의"
    checked = [c for c in req.components if c.isChecked]

    total_prior = sum(c.priorAmount or 0 for c in req.components)
    total_current = sum(c.currentAmount or 0 for c in req.components)
    total_delta = total_current - total_prior
    total_rate = f"{total_delta / abs(total_prior) * 100:.1f}%" if total_prior != 0 else "신규"

    checked_rows = "\n".join(
        f"| {c.name} | {'개별' if c.isIndividual else '합산'} | {_fmt(c.priorAmount)} | {_fmt(c.currentAmount)} | {_fmt(_delta_rate(c.priorAmount, c.currentAmount)[0])} | {_delta_rate(c.priorAmount, c.currentAmount)[1]} |"
        for c in checked
    ) or "| (없음) | - | - | - | - | - |"

    summary_prompt = _render(
        "analyze_summary.md.j2",
        account_name=req.accountName,
        account_type=req.accountType,
        mode_label=mode_label,
        period_str=period_str,
        mat_str=mat_str,
        component_count=len(req.components),
        checked_count=len(checked),
        total_prior=_fmt(total_prior),
        total_current=_fmt(total_current),
        total_delta=_fmt(total_delta),
        total_rate=total_rate,
        checked_rows=checked_rows,
        extra_files_section=extra_files_section,
    )

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

    reasons_prompt = _render(
        "analyze_reasons.md.j2",
        account_name=req.accountName,
        account_type=req.accountType,
        period_str=period_str,
        reasons_data=reasons_data,
    )

    try:
        summary_result, reasons_result = await asyncio.gather(
            genai_client.complete_json(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=summary_prompt,
                temperature=settings.GENAI_TEMPERATURE,
                max_tokens=settings.GENAI_MAX_TOKENS,
            ),
            genai_client.complete_json(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=reasons_prompt,
                temperature=settings.GENAI_TEMPERATURE,
                max_tokens=settings.GENAI_MAX_TOKENS,
            ),
        )
        return {
            "summary": summary_result.get("summary", ""),
            "components": reasons_result.get("components", []),
        }
    except Exception as e:
        logger.error("AI analyze failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="AI 분석 중 오류가 발생했습니다.")
