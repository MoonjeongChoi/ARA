'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { StorageQuotaError, storage } from '@/lib/storage'
import { Account, AccountStatus, ComponentItem, ExtraFileData, JournalEntry, Project } from '@/lib/types'
import { fmtDate, generateId } from '@/lib/utils'
import { computeRiskScore, RiskLevel } from '@/lib/risk'
import { downloadBlob, exportExcel } from '@/lib/api'
import Header from '@/components/Header'
import LedgerUploadStepper from '@/components/LedgerUploadStepper'
import JournalDrawer from '@/components/JournalDrawer'
import dynamic from 'next/dynamic'

const ParetoChart = dynamic(() => import('@/components/charts/ParetoChart'), { ssr: false })

const THRESHOLD = 0.1

const RISK_COLOR: Record<RiskLevel, string> = {
  low:      'bg-gray-100 text-gray-500',
  medium:   'bg-yellow-50 text-yellow-700',
  high:     'bg-orange-50 text-orange-600',
  critical: 'bg-pwc-redSoft text-pwc-red',
}
const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'L', medium: 'M', high: 'H', critical: '!'
}

const STATUS_OPTIONS: AccountStatus[] = ['미작성', '작성중', '완료']
const STATUS_COLOR: Record<AccountStatus, string> = {
  '미작성': 'bg-gray-100 text-gray-500',
  '작성중': 'bg-yellow-50 text-yellow-700',
  '완료': 'bg-green-50 text-green-700',
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-pwc-dark text-white text-sm rounded-xl shadow-lg">
      {message}
    </div>
  )
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

function defaultChecked(comps: ComponentItem[]): Set<string> {
  return new Set(comps.filter((c) => c.isIndividual).map((c) => c.id))
}

export default function AccountWorksheetPage() {
  const { id, accountId } = useParams<{ id: string; accountId: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [showStepper, setShowStepper] = useState(false)

  // Local editable state
  const [components, setComponents] = useState<ComponentItem[]>([])
  const [aiSummary, setAiSummary] = useState('')
  const [auditorMemo, setAuditorMemo] = useState('')
  const [status, setStatus] = useState<AccountStatus>('미작성')

  // AI analysis target selection
  const [analyzeChecked, setAnalyzeChecked] = useState<Set<string>>(new Set())

  // AI state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiStep, setAiStep] = useState<'' | '요약' | '사유'>('')

  // Export state
  const [exporting, setExporting] = useState(false)

  // Phase 8: drill-down journal drawer + pareto toggle
  const [drawerVendor, setDrawerVendor] = useState<string | null>(null)
  const [showPareto, setShowPareto] = useState(false)

  // Auto-save (silent) + last-saved display
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [lastSavedDisplay, setLastSavedDisplay] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    function update() {
      if (!lastSavedAt) { setLastSavedDisplay(null); return }
      const elapsed = Math.round((Date.now() - lastSavedAt) / 1000)
      setLastSavedDisplay(elapsed < 10 ? '방금 저장' : `${elapsed}초 전 저장`)
    }
    update()
    const t = setInterval(update, 5000)
    return () => clearInterval(t)
  }, [lastSavedAt])

  useEffect(() => {
    const p = storage.getProject(id)
    if (!p) { router.push('/'); return }
    const a = p.accounts.find((acc) => acc.id === accountId)
    if (!a) { router.push(`/projects/${id}`); return }
    setProject(p)
    setAccount(a)
    setComponents(a.components)
    setAiSummary(a.aiSummary ?? '')
    setAuditorMemo(a.auditorMemo ?? '')
    setStatus(a.status)
    setAnalyzeChecked(defaultChecked(a.components))
    if (a.inputMethod === 'zip' && a.components.length === 0) setShowStepper(true)
  }, [id, accountId])

  function persistAccount(updated: Account) {
    if (!project) return
    const updatedProject: Project = {
      ...project,
      accounts: project.accounts.map((a) => (a.id === updated.id ? updated : a)),
    }
    try {
      storage.saveProject(updatedProject)
    } catch (e) {
      if (e instanceof StorageQuotaError) {
        setToast(e.message)
        return
      }
      throw e
    }
    setProject(updatedProject)
    setAccount(updated)
  }

  function scheduleAutoSave(
    nextComponents: ComponentItem[],
    nextSummary: string,
    nextMemo: string,
    nextStatus: AccountStatus,
  ) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (!account) return
      persistAccount({
        ...account,
        components: nextComponents,
        aiSummary: nextSummary,
        auditorMemo: nextMemo,
        status: nextStatus,
      })
      setLastSavedAt(Date.now())
    }, 500)
  }

  function updateComponents(next: ComponentItem[]) {
    setComponents(next)
    scheduleAutoSave(next, aiSummary, auditorMemo, status)
  }

  function updateAiSummary(v: string) {
    setAiSummary(v)
    scheduleAutoSave(components, v, auditorMemo, status)
  }

  function updateAuditorMemo(v: string) {
    setAuditorMemo(v)
    scheduleAutoSave(components, aiSummary, v, status)
  }

  function cycleStatus() {
    const idx = STATUS_OPTIONS.indexOf(status)
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length]
    setStatus(next)
    if (!account) return
    const updated = { ...account, components, aiSummary, auditorMemo, status: next }
    persistAccount(updated)
    setToast(`상태: ${next}`)
  }

  function updateRow<K extends keyof ComponentItem>(rowId: string, field: K, value: ComponentItem[K]) {
    const next = components.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    updateComponents(next)
  }

  function toggleChecked(id: string, checked: boolean) {
    setAnalyzeChecked((prev) => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  function handleLedgerConfirm(
    newComponents: ComponentItem[],
    start: string,
    end: string,
    journalByVendor: Record<string, JournalEntry[]>,
    auditorInstruction: string,
    hasLedger: boolean,
    hasJournal: boolean,
    extraFiles: ExtraFileData[],
  ) {
    if (!account || !project) return
    const updated: Account = {
      ...account,
      components: newComponents,
      analysisPeriod: { start, end },
      journalByVendor,
      auditorInstruction,
      hasLedger,
      hasJournal,
      extraFiles,
      status: '작성중',
    }
    persistAccount(updated)
    setComponents(newComponents)
    setAnalyzeChecked(defaultChecked(newComponents))
    setStatus('작성중')
    setShowStepper(false)
  }

  async function handleExcelExport() {
    if (!account || !project) return
    setExporting(true)
    try {
      const payload = {
        project: {
          companyName: project.companyName,
          fiscalYear: project.fiscalYear,
          currentPeriod: project.currentPeriod,
          priorPeriod: project.priorPeriod,
          materialityAmount: project.materialityAmount,
        },
        accounts: [{
          id: account.id,
          name: account.name,
          type: account.type,
          analysisMode: account.analysisMode,
          materialityAmount: account.materialityAmount,
          analysisPeriod: account.analysisPeriod,
          auditorInstruction: account.auditorInstruction ?? '',
          aiSummary,
          auditorMemo,
          status,
          components: components.map((c) => ({
            name: c.name,
            priorAmount: c.priorAmount,
            currentAmount: c.currentAmount,
            isIndividual: c.isIndividual,
            aiReason: c.aiReason,
          })),
        }],
      }
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const blob = await exportExcel(payload)
      downloadBlob(blob, `${project.companyName}_${project.fiscalYear}_${account.name}_${today}.xlsx`)
      setToast('Excel 파일이 다운로드되었습니다')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Excel 내보내기 실패')
    } finally {
      setExporting(false)
    }
  }

  async function handleAiGenerate() {
    if (!account || !project) return
    const isInstructionMode = account.analysisMode === 'manual_define' && !!account.auditorInstruction
    if (!isInstructionMode && components.length === 0) return
    setAiLoading(true)
    setAiStep('요약')
    setAiError('')
    const stepTimer = setTimeout(() => setAiStep('사유'), 3000)
    try {
      const matAmount = account.materialityAmount ?? (project.materialityAmount > 0 ? project.materialityAmount : null)
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: account.name,
          accountType: account.type,
          analysisMode: account.analysisMode,
          components: components.map((c) => ({
            name: c.name,
            priorAmount: c.priorAmount,
            currentAmount: c.currentAmount,
            isIndividual: c.isIndividual,
            isChecked: analyzeChecked.has(c.id),
          })),
          materialityAmount: matAmount,
          analysisPeriod: account.analysisPeriod,
          journalByVendor: account.journalByVendor ?? {},
          auditorInstruction: account.auditorInstruction ?? '',
          extraFiles: account.extraFiles ?? [],
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error ?? e.detail ?? `AI 분석 실패 (HTTP ${res.status})`)
      }
      type AiComponent = { name: string; reason: string; beginning?: number; ending?: number }
      const data: { summary: string; components: AiComponent[] } = await res.json()
      const nextSummary = data.summary ?? ''
      let nextComponents: ComponentItem[]

      if (isInstructionMode) {
        nextComponents = (data.components ?? []).map((d) => ({
          id: generateId(),
          name: d.name,
          priorAmount: d.beginning ?? null,
          currentAmount: d.ending ?? null,
          isIndividual: true,
          aiReason: d.reason ?? '',
          auditorNote: '',
        }))
        setAnalyzeChecked(new Set(nextComponents.map((c) => c.id)))
      } else {
        nextComponents = components.map((c) => {
          if (!analyzeChecked.has(c.id)) return c
          const found = data.components?.find((d) => d.name === c.name)
          return { ...c, aiReason: found?.reason ?? '' }
        })
      }

      setAiSummary(nextSummary)
      setComponents(nextComponents)
      scheduleAutoSave(nextComponents, nextSummary, auditorMemo, status)
      setToast('AI 분석 완료')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 분석 중 오류가 발생했습니다.')
    } finally {
      clearTimeout(stepTimer)
      setAiStep('')
      setAiLoading(false)
    }
  }

  if (!project || !account) return null

  const matAmount = account.materialityAmount ?? (project.materialityAmount > 0 ? project.materialityAmount : null)
  const isInstructionMode = account.analysisMode === 'manual_define' && !!account.auditorInstruction

  const individualRows = components.filter((c) => c.isIndividual)
  const aggregateRows = components.filter((c) => !c.isIndividual)

  const subTotalPrior = aggregateRows.reduce((s, r) => s + (r.priorAmount ?? 0), 0)
  const subTotalCurrent = aggregateRows.reduce((s, r) => s + (r.currentAmount ?? 0), 0)
  const subDelta = subTotalCurrent - subTotalPrior
  const subRate = subTotalPrior !== 0 ? subDelta / Math.abs(subTotalPrior) : null

  const totalPrior = components.reduce((s, r) => s + (r.priorAmount ?? 0), 0)
  const totalCurrent = components.reduce((s, r) => s + (r.currentAmount ?? 0), 0)
  const totalDelta = totalCurrent - totalPrior
  const totalRate = totalPrior !== 0 ? totalDelta / Math.abs(totalPrior) : null

  const lastSaved = account.analysisPeriod
    ? `${fmtDate(account.analysisPeriod.start)} ~ ${fmtDate(account.analysisPeriod.end)}`
    : null


  const checkedCount = components.filter((c) => analyzeChecked.has(c.id)).length

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-5">
          <Link href="/" className="hover:text-pwc-red transition-colors">프로젝트 목록</Link>
          <span>›</span>
          <Link href={`/projects/${project.id}`} className="hover:text-pwc-red transition-colors">
            {project.companyName}
          </Link>
          <span>›</span>
          <span className="text-pwc-dark font-medium">{account.name}</span>
        </nav>

        {/* Account header card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-pwc-dark">{account.name}</h2>
                <button
                  onClick={cycleStatus}
                  className={`text-xs font-semibold px-2 py-1 rounded-full cursor-pointer transition-colors ${STATUS_COLOR[status]}`}
                >
                  {status}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
                <span>{account.type}</span>
                <span>·</span>
                <span>{account.analysisMode === 'auto_filter' ? '잔액 자동 필터' : '구성요소 직접 정의'}</span>
                {matAmount && (
                  <>
                    <span>·</span>
                    <span>중요성 {matAmount.toLocaleString('ko-KR')}천원</span>
                  </>
                )}
                {account.analysisPeriod && (
                  <>
                    <span>·</span>
                    <span>{fmtDate(account.analysisPeriod.start)} ~ {fmtDate(account.analysisPeriod.end)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {account.inputMethod === 'zip' && account.components.length > 0 && !showStepper && (
                <button
                  onClick={() => setShowStepper(true)}
                  className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  명세서 재업로드
                </button>
              )}
              <button
                onClick={handleExcelExport}
                disabled={exporting}
                className="text-sm border border-pwc-red text-pwc-red px-4 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? '생성 중...' : 'Excel Export'}
              </button>
              <button
                onClick={handleAiGenerate}
                disabled={aiLoading || (!isInstructionMode && components.length === 0)}
                className="flex items-center gap-2 bg-pwc-red text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {aiLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                )}
                {aiLoading ? `${aiStep} 생성 중...` : 'AI 사유 생성'}
              </button>
            </div>
          </div>
        </div>

        {/* Ledger Stepper */}
        {account.inputMethod === 'zip' && showStepper ? (
          <LedgerUploadStepper
            account={account}
            project={project}
            onConfirm={handleLedgerConfirm}
          />
        ) : (
          <>
            {/* AI Error */}
            {aiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
                {aiError}
              </div>
            )}

            {/* Auditor instruction display */}
            {account.auditorInstruction && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs font-semibold text-amber-700 mb-1">감사인 분석 지시</p>
                <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">{account.auditorInstruction}</p>
              </div>
            )}

            {/* Pareto Chart (collapsible) */}
            {components.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
                <button
                  onClick={() => setShowPareto((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-pwc-dark hover:bg-gray-50 transition-colors"
                >
                  <span>잔액 분포 (파레토 차트)</span>
                  <span className="text-gray-400 text-xs font-normal">{showPareto ? '접기 ▲' : '펼치기 ▼'}</span>
                </button>
                {showPareto && (
                  <div className="px-5 pb-4">
                    <ParetoChart components={components} />
                  </div>
                )}
              </div>
            )}

            {/* Section 1: AI Summary */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-pwc-dark">분석적 절차 요약</h3>
                <span className="text-xs text-gray-400">전체 합계 기준 · AI 생성 · 수정 가능</span>
              </div>
              <textarea
                value={aiSummary}
                onChange={(e) => updateAiSummary(e.target.value)}
                rows={4}
                placeholder="AI 사유 생성 버튼을 눌러 분석 요약을 생성하거나 직접 입력하세요."
                className="w-full text-sm text-gray-700 leading-relaxed resize-none border border-gray-200 rounded-lg px-3 py-2.5 focus:border-pwc-red focus:outline-none placeholder:text-gray-300"
              />
            </div>

            {/* Section 2: Component Table */}
            <div className="mb-1">
              {/* Table toolbar */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 font-medium">
                    AI 분석 대상: <span className="text-pwc-dark font-semibold">{checkedCount}</span> / {components.length}개
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setAnalyzeChecked(new Set(components.map((c) => c.id)))}
                      className="text-xs text-gray-500 hover:text-pwc-red transition-colors border border-gray-200 rounded px-2 py-0.5 hover:border-pwc-red"
                    >
                      전체 선택
                    </button>
                    <button
                      onClick={() => setAnalyzeChecked(new Set())}
                      className="text-xs text-gray-500 hover:text-pwc-red transition-colors border border-gray-200 rounded px-2 py-0.5 hover:border-pwc-red"
                    >
                      전체 해제
                    </button>
                  </div>
                </div>
                <span className="text-xs text-gray-400">체크된 항목만 개별 사유 생성</span>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="bg-pwc-dark text-white text-left">
                      <th className="px-3 py-3 font-semibold w-16 text-center">구분</th>
                      <th className="px-4 py-3 font-semibold">구성요소</th>
                      <th className="px-4 py-3 font-semibold">증감분석사유</th>
                      <th className="px-4 py-3 font-semibold text-right w-28">전기</th>
                      <th className="px-4 py-3 font-semibold text-right w-28">당기</th>
                      <th className="px-4 py-3 font-semibold text-right w-28">증감액</th>
                      <th className="px-4 py-3 font-semibold text-right w-20">증감률</th>
                      <th className="px-3 py-3 font-semibold text-center w-16">위험도</th>
                      <th className="w-8" />
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-50">
                    {components.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                          구성요소가 없습니다. 아래 + 행 추가 버튼을 눌러 시작하세요.
                        </td>
                      </tr>
                    )}

                    {/* Individual rows */}
                    {individualRows.map((row) => {
                      const delta = getDelta(row)
                      const rate = getDeltaRate(row)
                      const flagged = isFlagged(row)
                      const flagCls = flagged ? 'bg-pwc-redSoft text-pwc-red font-semibold' : ''
                      const isChecked = analyzeChecked.has(row.id)
                      const risk = computeRiskScore(row, totalCurrent, matAmount)
                      const journalCount = account.journalByVendor?.[row.name]?.length ?? 0

                      return (
                        <tr key={row.id} className={`hover:bg-gray-50/50 ${isChecked ? '' : 'opacity-70'}`}>
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => toggleChecked(row.id, e.target.checked)}
                                className="w-4 h-4 cursor-pointer accent-pwc-red rounded"
                              />
                              <span className={`text-xs ${isChecked ? 'text-pwc-red font-medium' : 'text-gray-400'}`}>
                                분석
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 w-32">
                            <input
                              value={row.name}
                              onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                              className="w-full bg-transparent border-b border-gray-200 focus:border-pwc-red focus:outline-none py-0.5 text-sm"
                              placeholder="항목명"
                            />
                            {journalCount > 0 && (
                              <button
                                onClick={() => setDrawerVendor(row.name)}
                                className="text-xs text-pwc-red hover:underline mt-0.5 block"
                              >
                                보기 ({journalCount})
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-2 min-w-[180px]">
                            {isChecked ? (
                              <textarea
                                value={row.aiReason}
                                onChange={(e) => updateRow(row.id, 'aiReason', e.target.value)}
                                rows={2}
                                placeholder="AI 사유 또는 직접 입력"
                                className="w-full text-xs text-gray-600 bg-transparent border-b border-gray-200 focus:border-pwc-red focus:outline-none resize-none py-0.5 leading-relaxed placeholder:text-gray-300"
                              />
                            ) : (
                              <span className="text-xs text-gray-300">분석 제외</span>
                            )}
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
                              : row.priorAmount === 0 ? '신규' : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              title={`위험도: ${risk.level} (${risk.score}점)`}
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${RISK_COLOR[risk.level]}`}
                            >
                              {RISK_LABEL[risk.level]}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => {
                                updateComponents(components.filter((r) => r.id !== row.id))
                                setAnalyzeChecked((prev) => { const next = new Set(prev); next.delete(row.id); return next })
                              }}
                              className="text-gray-300 hover:text-red-400 text-lg leading-none"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}

                    {/* Aggregate subtotal row */}
                    {aggregateRows.length > 0 && (
                      <tr className="bg-pwc-neutral200 font-semibold text-gray-600 text-sm">
                        <td className="px-3 py-2 text-center">
                          <span className="text-xs text-gray-400">합산</span>
                        </td>
                        <td className="px-4 py-2">기타 (합산)</td>
                        <td className="px-4 py-2 text-xs text-gray-400">중요성 미만 항목 합계</td>
                        <td className="px-4 py-2 text-right">{subTotalPrior.toLocaleString('ko-KR')}</td>
                        <td className="px-4 py-2 text-right">{subTotalCurrent.toLocaleString('ko-KR')}</td>
                        <td className={`px-4 py-2 text-right ${Math.abs(subRate ?? 0) > THRESHOLD ? 'text-pwc-red' : ''}`}>
                          {subDelta.toLocaleString('ko-KR')}
                        </td>
                        <td className={`px-4 py-2 text-right ${Math.abs(subRate ?? 0) > THRESHOLD ? 'text-pwc-red' : ''}`}>
                          {subRate !== null ? `${(subRate * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td />
                        <td />
                      </tr>
                    )}
                  </tbody>

                  {/* Grand total */}
                  {components.length > 0 && (
                    <tfoot>
                      <tr className="bg-pwc-dark text-white font-semibold text-sm">
                        <td />
                        <td className="px-4 py-3">합계</td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right">{totalPrior.toLocaleString('ko-KR')}</td>
                        <td className="px-4 py-3 text-right">{totalCurrent.toLocaleString('ko-KR')}</td>
                        <td className="px-4 py-3 text-right">{totalDelta.toLocaleString('ko-KR')}</td>
                        <td className="px-4 py-3 text-right">
                          {totalRate !== null ? `${(totalRate * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Add row */}
            <button
              onClick={() => {
                const newRow: ComponentItem = {
                  id: generateId(), name: '', priorAmount: null, currentAmount: null,
                  isIndividual: true, aiReason: '', auditorNote: '',
                }
                updateComponents([...components, newRow])
                setAnalyzeChecked((prev) => new Set([...prev, newRow.id]))
              }}
              className="text-sm text-pwc-red hover:underline font-medium mt-2 mb-6"
            >
              + 행 추가
            </button>

            {/* Section 3: Auditor Memo */}
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-5 mb-4">
              <h3 className="text-sm font-bold text-pwc-dark mb-3">감사인 메모</h3>
              <textarea
                value={auditorMemo}
                onChange={(e) => updateAuditorMemo(e.target.value)}
                rows={3}
                placeholder="감사인 추가 의견, 후속 절차 등을 기록하세요."
                className="w-full text-sm text-gray-700 leading-relaxed resize-none border border-gray-200 rounded-lg px-3 py-2.5 focus:border-pwc-red focus:outline-none placeholder:text-gray-300"
              />
            </div>

            {/* Meta bar */}
            <div className="bg-pwc-neutral100 rounded-lg px-4 py-2.5 flex items-center justify-between text-xs text-gray-400">
              <span>
                {lastSaved ? `분석 기간: ${lastSaved}` : '분석 기간 미지정'}
                {matAmount ? ` · 중요성: ${matAmount.toLocaleString('ko-KR')}천원` : ''}
              </span>
              <span className="flex items-center gap-3">
                {lastSavedDisplay && (
                  <span className="text-gray-400">{lastSavedDisplay}</span>
                )}
                <span>{project.companyName} · {project.fiscalYear}년도</span>
              </span>
            </div>
          </>
        )}
      </main>

      {drawerVendor !== null && account && (
        <JournalDrawer
          vendor={drawerVendor}
          entries={account.journalByVendor?.[drawerVendor] ?? []}
          onClose={() => setDrawerVendor(null)}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  )
}
