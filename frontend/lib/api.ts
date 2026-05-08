import { LedgerParseResult } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface ParsedFile {
  filename: string
  detected_date: string | null
  columns: string[]
  row_count: number
  parse_status: 'success' | 'failed'
  error_message?: string
}

export interface ZipParseResult {
  session_id: string
  file_unit: 'monthly' | 'daily' | 'unknown'
  file_count: number
  files: ParsedFile[]
  parse_errors: string[]
  suggested_amount_columns: string[]
  suggested_date_columns: string[]
}

export interface AggregateItem {
  name: string
  amount: number
  is_individual: boolean
}

export interface AggregateResult {
  total: number
  analysis_period: string
  items: AggregateItem[]
}

export async function parseZip(file: File): Promise<ZipParseResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/api/parse/zip`, { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? '파싱 실패')
  return res.json()
}

export async function parseLedger(options: {
  files: File[]
  accountFilters?: { code: string; name: string }[]
}): Promise<LedgerParseResult> {
  const form = new FormData()
  for (const f of options.files) form.append('files', f)
  form.append('account_filters', JSON.stringify(options.accountFilters ?? []))
  const res = await fetch(`${BASE}/api/parse/ledger`, { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? '파싱 실패')
  return res.json()
}

export async function exportExcel(payload: object): Promise<Blob> {
  const res = await fetch(`${BASE}/api/export/excel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? '내보내기 실패')
  return res.blob()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function aggregateData(body: {
  zip_session_id: string
  amount_column: string
  group_column?: string | null
  date_column?: string | null
  start_date?: string | null
  end_date?: string | null
  materiality_amount?: number | null
}): Promise<AggregateResult> {
  const res = await fetch(`${BASE}/api/parse/aggregate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? '집계 실패')
  return res.json()
}
