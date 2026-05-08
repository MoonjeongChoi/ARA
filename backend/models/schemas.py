from pydantic import BaseModel
from typing import Dict, List, Optional


class ParsedFile(BaseModel):
    filename: str
    detected_date: Optional[str] = None
    columns: List[str]
    row_count: int
    parse_status: str  # "success" | "failed"
    error_message: Optional[str] = None


class ZipParseResponse(BaseModel):
    session_id: str
    file_unit: str  # "monthly" | "daily" | "unknown"
    file_count: int
    files: List[ParsedFile]
    parse_errors: List[str]
    suggested_amount_columns: List[str]
    suggested_date_columns: List[str]


class AggregateRequest(BaseModel):
    zip_session_id: str
    amount_column: str
    group_column: Optional[str] = None
    date_column: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    materiality_amount: Optional[float] = None


class AggregateItem(BaseModel):
    name: str
    amount: float
    is_individual: bool


class AggregateResponse(BaseModel):
    total: float
    analysis_period: str
    items: List[AggregateItem]


# ── Ledger (명세서) parse ──────────────────────────────────────────────────────

class AccountFilter(BaseModel):
    code: str = ""
    name: str = ""


class LedgerSummaryItem(BaseModel):
    code: str
    name: str
    beginning: float
    increase: float
    decrease: float
    ending: float


class JournalEntry(BaseModel):
    date: str
    description: str
    amount: float
    type: str


class DetectedSheets(BaseModel):
    summary: Optional[str] = None
    movement: Optional[str] = None
    beginning: Optional[str] = None
    ending: Optional[str] = None
    all_sheets: List[str] = []


class ExtraFileData(BaseModel):
    filename: str
    sheet_names: List[str]
    preview_rows: List[Dict]
    row_count: int
    parse_status: str  # "success" | "failed"
    error_message: Optional[str] = None


class LedgerParseResponse(BaseModel):
    has_ledger: bool
    has_journal: bool
    summary: List[LedgerSummaryItem]
    journal_by_vendor: Dict[str, List[JournalEntry]]
    detected_sheets: DetectedSheets
    total_vendors: int
    total_journal_entries: int
    applied_filters: List[str]
    filtered_out_count: int
    parse_warnings: List[str]
    extra_files: List[ExtraFileData] = []


# ── Excel export ──────────────────────────────────────────────────────────────

class ExportComponentItem(BaseModel):
    name: str
    priorAmount: Optional[float] = None
    currentAmount: Optional[float] = None
    isIndividual: bool = True
    aiReason: str = ""


class ExportAccount(BaseModel):
    id: str
    name: str
    type: str
    analysisMode: str
    materialityAmount: Optional[float] = None
    analysisPeriod: Optional[Dict[str, str]] = None
    auditorInstruction: str = ""
    aiSummary: str = ""
    auditorMemo: str = ""
    status: str = ""
    components: List[ExportComponentItem] = []


class ExportProjectInfo(BaseModel):
    companyName: str
    fiscalYear: int
    currentPeriod: Dict[str, str]
    priorPeriod: Dict[str, str]
    materialityAmount: float = 0


class ExportRequest(BaseModel):
    project: ExportProjectInfo
    accounts: List[ExportAccount]
