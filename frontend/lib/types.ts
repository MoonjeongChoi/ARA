export type AccountType = '자산' | '부채' | '자본' | '수익' | '비용'
export type AnalysisMode = 'auto_filter' | 'manual_define'
export type InputMethod = 'manual' | 'zip'
export type AccountStatus = '미작성' | '작성중' | '완료'

export interface AccountFilter {
  code: string
  name: string
}

export interface JournalEntry {
  date: string
  description: string
  amount: number
  type: string
}

export interface LedgerSummaryItem {
  code: string
  name: string
  beginning: number
  increase: number
  decrease: number
  ending: number
}

export interface ExtraFileData {
  filename: string
  sheet_names: string[]
  preview_rows: Record<string, string>[]
  row_count: number
  parse_status: 'success' | 'failed'
  error_message?: string
}

export interface LedgerParseResult {
  has_ledger: boolean
  has_journal: boolean
  summary: LedgerSummaryItem[]
  journal_by_vendor: Record<string, JournalEntry[]>
  detected_sheets: {
    summary: string | null
    movement: string | null
    beginning: string | null
    ending: string | null
    all_sheets: string[]
  }
  total_vendors: number
  total_journal_entries: number
  applied_filters: string[]
  filtered_out_count: number
  parse_warnings: string[]
  extra_files: ExtraFileData[]
}

export interface ComponentItem {
  id: string
  name: string
  priorAmount: number | null
  currentAmount: number | null
  isIndividual: boolean
  aiReason: string
  auditorNote: string
}

export interface Account {
  id: string
  name: string
  type: AccountType
  analysisMode: AnalysisMode
  inputMethod: InputMethod
  materialityAmount: number | null
  status: AccountStatus
  components: ComponentItem[]
  aiSummary: string
  auditorMemo: string
  analysisPeriod: { start: string; end: string } | null
  journalByVendor?: Record<string, JournalEntry[]>
  accountFilters?: AccountFilter[]
  auditorInstruction?: string
  hasLedger?: boolean
  hasJournal?: boolean
  extraFiles?: ExtraFileData[]
}

export interface Project {
  id: string
  companyName: string
  fiscalYear: number
  currentPeriod: { start: string; end: string }
  priorPeriod: { start: string; end: string }
  materialityAmount: number
  accounts: Account[]
  createdAt: string
}
