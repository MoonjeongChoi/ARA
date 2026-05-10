'use client'

import { JournalEntry } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'

interface JournalDrawerProps {
  vendor: string
  entries: JournalEntry[]
  onClose: () => void
}

function fmtAmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('ko-KR')
}

function computeOutlierSet(amounts: number[]): Set<number> {
  if (amounts.length < 3) return new Set()
  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length
  const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length
  const std = Math.sqrt(variance)
  if (std === 0) return new Set()
  const indices = new Set<number>()
  amounts.forEach((a, i) => {
    if (Math.abs((a - mean) / std) > 2) indices.add(i)
  })
  return indices
}

export default function JournalDrawer({ vendor, entries, onClose }: JournalDrawerProps) {
  const sorted = [...entries].sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0))
  const total = sorted.reduce((s, e) => s + (e.amount ?? 0), 0)
  const outlierIndices = computeOutlierSet(sorted.map((e) => e.amount ?? 0))

  return (
    <Modal onClose={onClose} maxWidth="lg">
      <Modal.Header>분개 내역 — {vendor}</Modal.Header>
      <Modal.Body className="p-0 max-h-[60vh] overflow-y-auto">
        {entries.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400 leading-relaxed">
            분개 데이터가 없거나 새로고침으로 휘발됨.<br />
            명세서를 다시 업로드하면 복구됩니다.
          </div>
        ) : (
          <table className="w-full text-xs min-w-[480px]">
            <thead className="sticky top-0">
              <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-100">
                <th className="px-4 py-2 font-medium">일자</th>
                <th className="px-4 py-2 font-medium">적요</th>
                <th className="px-4 py-2 font-medium text-right">금액</th>
                <th className="px-4 py-2 font-medium text-center w-16">구분</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((e, i) => {
                const outlier = outlierIndices.has(i)
                return (
                  <tr key={i} className={outlier ? 'bg-pwc-redSoft' : 'hover:bg-gray-50/50'}>
                    <td className={`px-4 py-1.5 ${outlier ? 'text-pwc-red font-medium' : 'text-gray-500'}`}>
                      {e.date || '—'}
                    </td>
                    <td className={`px-4 py-1.5 ${outlier ? 'text-pwc-red font-medium' : 'text-gray-700'}`}>
                      {e.description || '(적요 없음)'}
                      {outlier && (
                        <span className="ml-1.5 text-xs bg-pwc-red text-white px-1 py-0.5 rounded">
                          이상치
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-1.5 text-right font-mono ${outlier ? 'text-pwc-red font-semibold' : 'text-gray-700'}`}>
                      {fmtAmt(e.amount)}
                    </td>
                    <td className="px-4 py-1.5 text-center text-gray-400">
                      {e.type || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-pwc-dark text-white text-xs font-semibold">
                <td colSpan={2} className="px-4 py-2">합계 ({sorted.length}건)</td>
                <td className="px-4 py-2 text-right font-mono">{fmtAmt(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          onClick={onClose}
          className="ml-auto text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
        >
          닫기
        </button>
      </Modal.Footer>
    </Modal>
  )
}
