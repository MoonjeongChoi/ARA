'use client'

import { useState, useEffect } from 'react'
import { Account, AccountStatus, ComponentItem, Project } from '@/lib/types'
import { generateId } from '@/lib/utils'

interface Props {
  account: Account
  project: Project
  onSave: (components: ComponentItem[], status: AccountStatus) => void
}

function AmountInput({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState('')

  const display = focused ? raw : (value !== null ? value.toLocaleString('ko-KR') : '')

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9\-]/g, '')
        setRaw(digits)
        onChange(digits === '' || digits === '-' ? null : Number(digits))
      }}
      onFocus={() => { setFocused(true); setRaw(value !== null ? String(value) : '') }}
      onBlur={() => setFocused(false)}
      className="w-full text-right bg-transparent border-b border-gray-200 focus:border-pwc-red focus:outline-none py-0.5 text-sm"
      placeholder="0"
    />
  )
}

const THRESHOLD = 0.1

export default function ManualInputTable({ account, project, onSave }: Props) {
  const [rows, setRows] = useState<ComponentItem[]>(account.components)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    setRows(account.components)
    setIsDirty(false)
  }, [account.id])

  const matAmount = account.materialityAmount ?? (project.materialityAmount > 0 ? project.materialityAmount : null)

  function isIndividual(row: ComponentItem): boolean {
    if (account.analysisMode !== 'auto_filter' || matAmount === null) return true
    return (row.currentAmount ?? 0) >= matAmount
  }

  function getDelta(row: ComponentItem): number | null {
    if (row.currentAmount === null || row.priorAmount === null) return null
    return row.currentAmount - row.priorAmount
  }

  function getDeltaRate(row: ComponentItem): number | null {
    if (row.priorAmount === null || row.priorAmount === 0 || row.currentAmount === null) return null
    return (row.currentAmount - row.priorAmount) / Math.abs(row.priorAmount)
  }

  function isFlagged(row: ComponentItem): boolean {
    const rate = getDeltaRate(row)
    return rate !== null && Math.abs(rate) > THRESHOLD
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: generateId(), name: '', priorAmount: null, currentAmount: null, isIndividual: true, aiReason: '', auditorNote: '' },
    ])
    setIsDirty(true)
  }

  function updateRow<K extends keyof ComponentItem>(id: string, field: K, value: ComponentItem[K]) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
    setIsDirty(true)
  }

  function deleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
    setIsDirty(true)
  }

  function handleSave(status: AccountStatus) {
    const updated = rows.map((r) => ({ ...r, isIndividual: isIndividual(r) }))
    onSave(updated, status)
    setIsDirty(false)
  }

  const totalPrior = rows.reduce((s, r) => s + (r.priorAmount ?? 0), 0)
  const totalCurrent = rows.reduce((s, r) => s + (r.currentAmount ?? 0), 0)
  const totalDelta = totalCurrent - totalPrior
  const totalRate = totalPrior !== 0 ? totalDelta / Math.abs(totalPrior) : null

  const showBadge = account.analysisMode === 'auto_filter'

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto mb-4">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-pwc-dark text-white text-left">
              {showBadge && <th className="px-3 py-3 font-semibold w-16 text-center">구분</th>}
              <th className="px-4 py-3 font-semibold">구성요소</th>
              <th className="px-4 py-3 font-semibold text-right w-28">전기</th>
              <th className="px-4 py-3 font-semibold text-right w-28">당기</th>
              <th className="px-4 py-3 font-semibold text-right w-28">증감액</th>
              <th className="px-4 py-3 font-semibold text-right w-20">증감률</th>
              <th className="w-8" />
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={showBadge ? 7 : 6} className="px-4 py-8 text-center text-gray-400 text-sm">
                  하단 버튼을 눌러 구성요소를 추가하세요
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const delta = getDelta(row)
              const rate = getDeltaRate(row)
              const flagged = isFlagged(row)
              const individual = isIndividual(row)

              const flagCls = flagged
                ? 'bg-[#FDECEA] text-[#E0301E] font-semibold'
                : ''
              const rowCls = !individual ? 'italic text-gray-400' : ''

              return (
                <tr key={row.id} className={`${rowCls} hover:bg-gray-50/50`}>
                  {showBadge && (
                    <td className="px-3 py-2 text-center">
                      {individual ? (
                        <span className="text-xs bg-[#E6F1FB] text-blue-600 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                          개별
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">합산</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2">
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                      className="w-full bg-transparent border-b border-gray-200 focus:border-pwc-red focus:outline-none py-0.5 text-sm"
                      placeholder="항목명"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <AmountInput value={row.priorAmount} onChange={(v) => updateRow(row.id, 'priorAmount', v)} />
                  </td>
                  <td className="px-4 py-2">
                    <AmountInput value={row.currentAmount} onChange={(v) => updateRow(row.id, 'currentAmount', v)} />
                  </td>
                  <td className={`px-4 py-2 text-right ${flagCls}`}>
                    {delta !== null ? delta.toLocaleString('ko-KR') : '—'}
                  </td>
                  <td className={`px-4 py-2 text-right ${flagCls}`}>
                    {rate !== null
                      ? `${(rate * 100).toFixed(1)}%`
                      : row.priorAmount === 0
                      ? '신규'
                      : '—'}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => deleteRow(row.id)}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-pwc-dark border-t border-gray-200">
                {showBadge && <td />}
                <td className="px-4 py-3 text-sm">합계</td>
                <td className="px-4 py-3 text-right text-sm">{totalPrior.toLocaleString('ko-KR')}</td>
                <td className="px-4 py-3 text-right text-sm">{totalCurrent.toLocaleString('ko-KR')}</td>
                <td className={`px-4 py-3 text-right text-sm ${Math.abs(totalRate ?? 0) > THRESHOLD ? 'text-pwc-red' : ''}`}>
                  {totalDelta.toLocaleString('ko-KR')}
                </td>
                <td className={`px-4 py-3 text-right text-sm ${Math.abs(totalRate ?? 0) > THRESHOLD ? 'text-pwc-red' : ''}`}>
                  {totalRate !== null ? `${(totalRate * 100).toFixed(1)}%` : '—'}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={addRow}
          className="text-sm text-pwc-red hover:underline font-medium"
        >
          + 행 추가
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => handleSave('작성중')}
            disabled={!isDirty}
            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            저장
          </button>
          <button
            onClick={() => handleSave('완료')}
            className="px-4 py-2 bg-pwc-red text-white text-sm rounded-lg font-semibold hover:bg-red-700 transition-colors"
          >
            완료로 표시
          </button>
        </div>
      </div>
    </div>
  )
}
