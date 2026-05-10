'use client'

import { useState } from 'react'
import { Account, AccountStatus, Project } from '@/lib/types'
import { downloadBlob, exportExcel } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface Props {
  project: Project
  onClose: () => void
}

const STATUS_COLOR: Record<AccountStatus, string> = {
  '미작성': 'bg-gray-100 text-gray-500',
  '작성중': 'bg-yellow-50 text-yellow-700',
  '완료':   'bg-green-50 text-green-700',
}

function buildPayload(project: Project, accounts: Account[]) {
  return {
    project: {
      companyName: project.companyName,
      fiscalYear: project.fiscalYear,
      currentPeriod: project.currentPeriod,
      priorPeriod: project.priorPeriod,
      materialityAmount: project.materialityAmount,
    },
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      analysisMode: a.analysisMode,
      materialityAmount: a.materialityAmount,
      analysisPeriod: a.analysisPeriod,
      auditorInstruction: a.auditorInstruction ?? '',
      aiSummary: a.aiSummary,
      auditorMemo: a.auditorMemo,
      status: a.status,
      components: a.components.map((c) => ({
        name: c.name,
        priorAmount: c.priorAmount,
        currentAmount: c.currentAmount,
        isIndividual: c.isIndividual,
        aiReason: c.aiReason,
      })),
    })),
  }
}

export default function ExportModal({ project, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const [selected, setSelected] = useState<Set<string>>(
    new Set(project.accounts.map((a) => a.id))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allChecked = selected.size === project.accounts.length
  const someChecked = selected.size > 0 && selected.size < project.accounts.length

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(project.accounts.map((a) => a.id)))
  }

  function toggle(id: string) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const selectedAccounts = project.accounts.filter((a) => selected.has(a.id))
  const hasDraft = selectedAccounts.some((a) => a.status === '미작성')
  const filename = `${project.companyName}_${project.fiscalYear}_분석적검토_${today}.xlsx`

  async function handleExport() {
    if (selectedAccounts.length === 0) return
    setLoading(true)
    setError('')
    try {
      const blob = await exportExcel(buildPayload(project, selectedAccounts))
      downloadBlob(blob, filename)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '내보내기 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth="md">
      <Modal.Header>Excel Export</Modal.Header>
      <Modal.Body className="space-y-3 max-h-[60vh] overflow-y-auto">
        {/* Select all */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none pb-2 border-b border-gray-100">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked }}
            onChange={toggleAll}
            className="w-4 h-4 accent-pwc-red rounded"
          />
          <span className="text-sm font-semibold text-pwc-dark">전체 선택</span>
          <span className="text-xs text-gray-400 ml-auto">{selectedAccounts.length} / {project.accounts.length}</span>
        </label>

        {/* Account list */}
        <div className="space-y-1.5">
          {project.accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2.5 cursor-pointer select-none group py-0.5">
              <input
                type="checkbox"
                checked={selected.has(a.id)}
                onChange={() => toggle(a.id)}
                className="w-4 h-4 accent-pwc-red rounded shrink-0"
              />
              <span className="text-sm text-pwc-dark flex-1 truncate">{a.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{a.type}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[a.status]}`}>
                {a.status}
              </span>
            </label>
          ))}
        </div>

        {/* Draft warning */}
        {hasDraft && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
            ⚠ 미작성 계정이 포함되어 있습니다. 데이터 없이 빈 시트로 내보내집니다.
          </p>
        )}

        {/* Filename preview */}
        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">파일명</p>
          <p className="text-sm text-pwc-dark font-medium break-all">{filename}</p>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" className="flex-1" onClick={onClose}>취소</Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={handleExport}
          disabled={loading || selectedAccounts.length === 0}
        >
          {loading ? '생성 중...' : 'Export'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
