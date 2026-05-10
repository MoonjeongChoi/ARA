from typing import Dict, List, Optional

from pydantic import BaseModel

# ── Column mapping models ──────────────────────────────────────────────────────

class LedgerColumnMapping(BaseModel):
    """분개장 컬럼 인덱스 매핑 (자동 감지 실패 시 fallback)."""
    key_a_idx:  int = 0   # 전표유형_계정번호
    key_b_idx:  int = 1   # 세그_계정번호
    desc_idx:   int = 7   # 적요
    vendor_idx: int = 9   # 공급업체명
    date_idx:   int = 11  # 전기일
    amount_idx: int = 14  # 금액
    type_idx:   int = 16  # 증감구분


class SummaryColumnMapping(BaseModel):
    """집계표 컬럼 인덱스 매핑 (자동 감지 실패 시 fallback)."""
    code_idx:  int = 0  # 계정코드
    name_idx:  int = 1  # 계정명
    begin_idx: int = 2  # 기초잔액
    inc_idx:   int = 3  # 증가
    dec_idx:   int = 4  # 감소
    end_idx:   int = 5  # 기말잔액


class DetectedMovementColumns(BaseModel):
    """분개장 파싱 시 자동 감지된 컬럼명."""
    vendor: Optional[str] = None
    amount: Optional[str] = None
    date:   Optional[str] = None
    desc:   Optional[str] = None
    type:   Optional[str] = None


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
    detected_movement_columns: Optional[DetectedMovementColumns] = None


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
