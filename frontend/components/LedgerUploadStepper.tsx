'use client'

import { useRef, useState } from 'react'
import { Account, ComponentItem, DetectedMovementColumns, ExtraFileData, JournalEntry, LedgerParseResult, LedgerSummaryItem, Project } from '@/lib/types'
import { parseLedger } from '@/lib/api'
import { generateId } from '@/lib/utils'

interface Props {
  account: Account
  project: Project
  onConfirm: (
    components: ComponentItem[],
    start: string,
    end: string,
    journalByVendor: Record<string, JournalEntry[]>,
    auditorInstruction: string,
    hasLedger: boolean,
    hasJournal: boolean,
    extraFiles: ExtraFileData[],
  ) => void
}

const ALL_EXTS = ['.xlsx', '.xls', '.xlsb', '.zip']

const INSTRUCTION_EXAMPLES = [
  { label: 'plant별 분석', text: 'plant별로 재고자산 증감을 분석해줘. 각 plant의 기초/기말 잔액과 증감 사유를 도출해줘.' },
  { label: '품목군별 분석', text: '품목군(완제품/반제품/원재료/저장품)별로 구분하여 증감을 분석해줘.' },
  { label: '제품/반제품/원재료', text: '재고자산을 제품, 반제품, 원재료, 저장품으로 구분하여 기초/기말 잔액과 증감 사유를 분석해줘.' },
]

function DetectedColumnsPanel({ cols }: { cols: DetectedMovementColumns }) {
  const entries = [
    { label: '거래처', value: cols.vendor },
    { label: '금액', value: cols.amount },
    { label: '날짜', value: cols.date },
    { label: '적요', value: cols.desc },
    { label: '구분', value: cols.type },
  ].filter((e) => e.value)
  if (entries.length === 0) return null
  return (
    <details className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
      <summary className="cursor-pointer select-none font-medium text-gray-600">
        감지된 분개장 컬럼 ({entries.length}개)
      </summary>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {entries.map((e) => (
          <span key={e.label}>
            <span className="text-gray-400">{e.label}: </span>
            <span className="font-medium text-gray-700">{e.value}</span>
          </span>
        ))}
      </div>
    </details>
  )
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function FileUploadZone({
  files, onAdd, onRemove,
}: {
  files: File[]
  onAdd: (fs: File[]) => void
  onRemove: (i: number) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const hasFiles = files.length > 0

  function handleFileList(list: FileList) {
    const valid = Array.from(list).filter(
      (f) => ALL_EXTS.includes(f.name.slice(f.name.lastIndexOf('.')).toLowerCase())
    )
    if (valid.length) onAdd(valid)
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFileList(e.dataTransfer.files) }}
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 cursor-pointer transition-colors
          ${dragging ? 'border-pwc-red bg-red-50'
            : hasFiles ? 'border-green-300 bg-green-50'
            : 'border-gray-200 hover:border-gray-300'}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{hasFiles ? '✓' : '📄'}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${hasFiles ? 'text-green-700' : 'text-pwc-dark'}`}>
              {hasFiles ? `${files.length}개 파일 선택됨` : '분석에 사용할 파일을 업로드하세요.'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {hasFiles ? '클릭하여 파일 추가 가능' : '명세서, 분개장, 수불부, 매출원장 등'}
            </p>
          </div>
          {!hasFiles && (
            <span className="text-xs text-gray-400 shrink-0">xlsx / xls / xlsb / zip</span>
          )}
        </div>
      </div>
      <input
        ref={ref} type="file" multiple accept=".xlsx,.xls,.xlsb,.zip" className="hidden"
        onChange={(e) => { if (e.target.files) { handleFileList(e.target.files); e.target.value = '' } }}
      />
      {hasFiles && (
        <div className="flex flex-wrap gap-2 mt-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">
              {f.name}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(i) }}
                className="text-gray-400 hover:text-red-400 text-base leading-none ml-0.5"
              >×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function buildComponents(
  items: LedgerSummaryItem[],
  materialityAmount: number | null,
): ComponentItem[] {
  const individual: ComponentItem[] = []
  let otherBegin = 0, otherEnd = 0

  for (const item of items) {
    if (materialityAmount === null || Math.abs(item.ending) >= materialityAmount) {
      individual.push({
        id: generateId(), name: item.name,
        priorAmount: item.beginning, currentAmount: item.ending,
        isIndividual: true, aiReason: '', auditorNote: '',
      })
    } else {
      otherBegin += item.beginning
      otherEnd   += item.ending
    }
  }
  if (otherBegin !== 0 || otherEnd !== 0) {
    individual.push({
      id: generateId(), name: '기타',
      priorAmount: otherBegin, currentAmount: otherEnd,
      isIndividual: false, aiReason: '', auditorNote: '',
    })
  }
  return individual
}

export default function LedgerUploadStepper({ account, project, onConfirm }: Props) {
  const isManualDefine = account.analysisMode === 'manual_define'
  const STEPS = isManualDefine ? ['자료 업로드'] : ['자료 업로드', '집계 미리보기']

  const [step, setStep] = useState(1)
  const [files, setFiles] = useState<File[]>([])
  const [instruction, setInstruction] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [result, setResult] = useState<LedgerParseResult | null>(null)

  const defaultMat = account.materialityAmount ?? (project.materialityAmount > 0 ? project.materialityAmount : null)
  const [matInput, setMatInput] = useState(defaultMat !== null ? String(defaultMat) : '')
  const matAmount = matInput !== '' ? Number(matInput.replace(/,/g, '')) : null

  const sortedSummary = result
    ? [...result.summary].sort((a, b) => Math.abs(b.ending) - Math.abs(a.ending))
    : []
  const totalEnding    = sortedSummary.reduce((s, i) => s + Math.abs(i.ending), 0)
  const individualItems = sortedSummary.filter((i) => matAmount === null || Math.abs(i.ending) >= matAmount)
  const coveragePct    = totalEnding > 0 ? ((individualItems.reduce((s, i) => s + Math.abs(i.ending), 0) / totalEnding) * 100).toFixed(1) : '0.0'

  function doConfirm(parsedResult: LedgerParseResult) {
    const sorted = [...parsedResult.summary].sort((a, b) => Math.abs(b.ending) - Math.abs(a.ending))
    const components = isManualDefine ? [] : buildComponents(sorted, matAmount)
    onConfirm(
      components,
      project.currentPeriod.start,
      project.currentPeriod.end,
      parsedResult.journal_by_vendor,
      instruction,
      parsedResult.has_ledger,
      parsedResult.has_journal,
      parsedResult.extra_files ?? [],
    )
  }

  async function handleParseAndNext() {
    if (files.length === 0) return
    setParsing(true)
    setParseError('')
    try {
      const res = await parseLedger({
        files,
        accountFilters: account.accountFilters ?? [],
      })
      setResult(res)
      if (isManualDefine) {
        doConfirm(res)
      } else {
        setStep(2)
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '파싱 실패')
    } finally {
      setParsing(false)
    }
  }

  const canProceed = files.length > 0 && !parsing

  return (
    <div>
      {/* Step indicator */}
      {STEPS.length > 1 && (
        <div className="flex mb-6">
          {STEPS.map((label, i) => {
            const n = i + 1; const active = step === n; const done = step > n
            return (
              <div key={n} className="flex-1 flex flex-col items-center gap-1 relative">
                {i > 0 && (
                  <div className={`absolute top-3 right-1/2 w-full h-0.5 -translate-y-1/2 ${done ? 'bg-green-400' : 'bg-gray-100'}`} />
                )}
                <div className={`relative z-10 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center
                  ${active ? 'bg-pwc-red text-white' : done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {done ? <CheckIcon /> : n}
                </div>
                <span className={`text-xs text-center ${active ? 'text-pwc-dark font-semibold' : 'text-gray-400'}`}>{label}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold text-pwc-dark">자료 업로드</h3>

          <FileUploadZone
            files={files}
            onAdd={(fs) => setFiles((prev) => [...prev, ...fs])}
            onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
          />

          {files.length === 0 && (
            <p className="text-xs text-gray-400 text-center">※ 최소 하나 이상 업로드 필요</p>
          )}

          {/* Account filter badge */}
          {(account.accountFilters ?? []).filter((f) => f.code || f.name).length > 0 && (
            <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
              적용된 계정 필터: {account.accountFilters!.filter((f) => f.code || f.name).map((f) => f.code || f.name).join(', ')}
            </div>
          )}

          {/* 분석 방향 지시 (manual_define only) */}
          {isManualDefine && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-semibold text-pwc-dark">🎯  분석 방향 지시</label>
                <span className="text-xs text-gray-400">(선택)</span>
              </div>
              <p className="text-xs text-gray-400 mb-2">
                AI에게 원하는 분석 방향을 자유롭게 입력하세요. 입력하지 않으면 AI가 자동으로 구성요소를 도출합니다.
              </p>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                placeholder="예: plant별로 재고자산 증감을 분석해줘."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pwc-red/20 focus:border-pwc-red resize-none placeholder:text-gray-300"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {INSTRUCTION_EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => setInstruction(ex.text)}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1 rounded-full hover:border-pwc-red hover:text-pwc-red transition-colors"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {parseError && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{parseError}</p>
          )}
        </div>
      )}

      {/* ── Step 2 (auto_filter only) ── */}
      {step === 2 && result && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-semibold text-pwc-dark">집계 미리보기</h3>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 shrink-0">중요성 금액</label>
              <input
                type="text" inputMode="numeric"
                value={matInput}
                onChange={(e) => setMatInput(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="천원"
                className="w-32 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pwc-red/20 focus:border-pwc-red text-right"
              />
              <span className="text-sm text-gray-400 shrink-0">천원</span>
            </div>
          </div>

          {/* Parse info */}
          <div className="space-y-1">
            {result.has_ledger && result.detected_sheets.summary && (
              <p className="text-sm text-green-700 flex items-center gap-1.5">
                <span className="font-bold">✓</span> 집계표 시트: <span className="font-semibold">&quot;{result.detected_sheets.summary}&quot;</span>
              </p>
            )}
            {result.has_journal && (
              <p className="text-sm text-green-700 flex items-center gap-1.5">
                <span className="font-bold">✓</span> 분개 내역: <span className="font-semibold">{result.total_vendors}개</span> 거래처, <span className="font-semibold">{result.total_journal_entries.toLocaleString('ko-KR')}건</span>
              </p>
            )}
            {result.applied_filters.length > 0 && (
              <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                계정 필터 적용: {result.applied_filters.join(', ')} ({result.filtered_out_count}건 제외)
              </p>
            )}
            {(result.extra_files ?? []).length > 0 && (
              <p className="text-xs text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg">
                기타 파일: {result.extra_files.map((f) => f.filename).join(', ')}
              </p>
            )}
            {result.parse_warnings.map((w, i) => (
              <p key={i} className="text-xs text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-lg">{w}</p>
            ))}
            {result.detected_movement_columns && (
              <DetectedColumnsPanel cols={result.detected_movement_columns} />
            )}
          </div>

          {sortedSummary.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm px-4 py-3 rounded-lg">
              집계표(명세서)가 없어 잔액 미리보기를 표시할 수 없습니다. 확정 후 기초/기말 잔액을 직접 입력하세요.
            </div>
          ) : (
            <>
              <div className="bg-blue-50 text-blue-700 text-sm px-4 py-2.5 rounded-lg">
                개별분석 <span className="font-semibold">{individualItems.length}개사</span> / 전체 잔액의 <span className="font-semibold">{coveragePct}%</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium w-20 text-center">구분</th>
                      <th className="px-3 py-2 font-medium">코드</th>
                      <th className="px-3 py-2 font-medium">거래처명</th>
                      <th className="px-3 py-2 font-medium text-right">기초</th>
                      <th className="px-3 py-2 font-medium text-right">기말</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedSummary.map((item, idx) => {
                      const isIndiv = matAmount === null || Math.abs(item.ending) >= matAmount
                      return (
                        <tr key={idx} className={`${isIndiv ? '' : 'text-gray-400'} hover:bg-gray-50/50`}>
                          <td className="px-3 py-2 text-center">
                            {isIndiv
                              ? <span className="text-xs bg-pwc-infoSoft text-blue-600 px-2 py-0.5 rounded-full font-medium">개별분석</span>
                              : <span className="text-xs text-gray-400">합산</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{item.code}</td>
                          <td className="px-3 py-2 font-medium text-pwc-dark">{item.name}</td>
                          <td className="px-3 py-2 text-right">{item.beginning.toLocaleString('ko-KR')}</td>
                          <td className="px-3 py-2 text-right font-medium">{item.ending.toLocaleString('ko-KR')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-4">
        {step > 1 && (
          <button
            onClick={() => setStep(1)}
            className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            이전
          </button>
        )}
        <div className="flex-1" />
        {step === 1 ? (
          <button
            onClick={handleParseAndNext}
            disabled={!canProceed}
            className="px-5 py-2.5 bg-pwc-red text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {parsing ? '파싱 중...' : isManualDefine ? '확정' : '다음'}
          </button>
        ) : (
          <button
            onClick={() => result && doConfirm(result)}
            className="px-5 py-2.5 bg-pwc-red text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
          >
            확정
          </button>
        )}
      </div>
    </div>
  )
}
