export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  return d.replace(/-/g, '.')
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('ko-KR')
}

export function formatAmountInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  return digits ? Number(digits).toLocaleString('ko-KR') : ''
}
