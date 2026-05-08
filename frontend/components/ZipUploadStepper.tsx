'use client'

import { useRef, useState, useEffect } from 'react'
import { Account, ComponentItem, Project } from '@/lib/types'
import { generateId } from '@/lib/utils'
import { AggregateItem, ZipParseResult, aggregateData, parseZip } from '@/lib/api'

interface Props {
  account: Account
  project: Project
  onConfirm: (components: ComponentItem[], start: string, end: string) => void
}

function ZipDropzone({
  label,
  required,
  file,
  result,
  uploading,
  error,
  onFile,
}: {
  label: string
  required?: boolean
  file: File | null
  result: ZipParseResult | null
  uploading: boolean
  error: string
  onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const unitLabel =
    result?.file_unit === 'monthly'
      ? '월별'
      : result?.file_unit === 'daily'
      ? '일별'
      : '기타'

  return (
    <div>
      <label className="block text-sm font-medium text-pwc-dark mb-1">
        {label} {required && <span className="text-pwc-red">*</span>}
      </label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f?.name.endsWith('.zip')) onFile(f)
        }}
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
          ${dragging ? 'border-pwc-red bg-red-50' : result ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
      >
        {result ? (
          <div className="text-sm">
            <p className="font-semibold text-green-700">{file?.name}</p>
            <p className="text-gray-500 mt-0.5">
              {unitLabel} 파일 {result.file_count}개 감지
              {result.parse_errors.length > 0 && (
                <span className="text-yellow-600 ml-2">({result.parse_errors.length}개 오류)</span>
              )}
            </p>
          </div>
        ) : uploading ? (
          <p className="text-sm text-gray-400">파싱 중...</p>
        ) : (
          <div className="text-gray-400">
            <p className="text-sm">ZIP 파일을 드래그하거나 클릭하여 업로드</p>
            <p className="text-xs mt-1">xlsx / xls / xlsb 파일이 담긴 ZIP</p>
          </div>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
      <input
        ref={ref}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}

function ColSelect({
  label,
  value,
  options,
  suggested,
  onChange,
  required,
}: {
  label: string
  value: string
  options: string[]
  suggested?: string[]
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-pwc-dark mb-1">
        {label} {required && <span className="text-pwc-red">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pwc-red/20 focus:border-pwc-red"
      >
        <option value="">— 선택 —</option>
        {suggested && suggested.length > 0 && (
          <optgroup label="추천">
            {suggested.map((c) => <option key={c} value={c}>{c}</option>)}
          </optgroup>
        )}
        <optgroup label="전체 컬럼">
          {options.filter((c) => !suggested?.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      </select>
    </div>
  )
}

const STEPS = ['ZIP 업로드', '분석 기간', '컬럼 매핑', '집계 미리보기']

export default function ZipUploadStepper({ account, project, onConfirm }: Props) {
  const [step, setStep] = useState(1)

  // Step 1
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [currentResult, setCurrentResult] = useState<ZipParseResult | null>(null)
  const [uploadingCurrent, setUploadingCurrent] = useState(false)
  const [currentError, setCurrentError] = useState('')

  const [priorFile, setPriorFile] = useState<File | null>(null)
  const [priorResult, setPriorResult] = useState<ZipParseResult | null>(null)
  const [uploadingPrior, setUploadingPrior] = useState(false)
  const [priorError, setPriorError] = useState('')

  // Step 2
  const [startDate, setStartDate] = useState(project.currentPeriod.start)
  const [endDate, setEndDate] = useState(project.currentPeriod.end)
  const [priorStartDate, setPriorStartDate] = useState(project.priorPeriod.start)
  const [priorEndDate, setPriorEndDate] = useState(project.priorPeriod.end)

  // Step 3
  const allColumns = currentResult?.files.find((f) => f.parse_status === 'success')?.columns ?? []
  const suggestedAmount = currentResult?.suggested_amount_columns ?? []
  const suggestedDate = currentResult?.suggested_date_columns ?? []

  const [amountColumn, setAmountColumn] = useState('')
  const [dateColumn, setDateColumn] = useState('')
  const [groupColumn, setGroupColumn] = useState('')

  useEffect(() => {
    if (suggestedAmount[0] && !amountColumn) setAmountColumn(suggestedAmount[0])
    if (suggestedDate[0] && !dateColumn) setDateColumn(suggestedDate[0])
  }, [currentResult])

  // Step 4
  const [currentItems, setCurrentItems] = useState<AggregateItem[]>([])
  const [priorItems, setPriorItems] = useState<AggregateItem[]>([])
  const [aggregating, setAggregating] = useState(false)
  const [aggregateError, setAggregateError] = useState('')
  const [aggregated, setAggregated] = useState(false)

  async function uploadFile(
    file: File,
    setUploading: (v: boolean) => void,
    setResult: (r: ZipParseResult) => void,
    setError: (e: string) => void
  ) {
    setUploading(true)
    setError('')
    try {
      const result = await parseZip(file)
      setResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  function handleCurrentFile(f: File) {
    setCurrentFile(f)
    uploadFile(f, setUploadingCurrent, setCurrentResult, setCurrentError)
  }

  function handlePriorFile(f: File) {
    setPriorFile(f)
    uploadFile(f, setUploadingPrior, setPriorResult, setPriorError)
  }

  async function handleAggregate() {
    if (!currentResult) return
    setAggregating(true)
    setAggregateError('')
    try {
      const matAmount =
        account.analysisMode === 'auto_filter'
          ? (account.materialityAmount ?? (project.materialityAmount > 0 ? project.materialityAmount : null))
          : null

      const curAgg = await aggregateData({
        zip_session_id: currentResult.session_id,
        amount_column: amountColumn,
        group_column: groupColumn || null,
        date_column: dateColumn || null,
        start_date: startDate,
        end_date: endDate,
        materiality_amount: matAmount,
      })
      setCurrentItems(curAgg.items)

      if (priorResult) {
        const priAgg = await aggregateData({
          zip_session_id: priorResult.session_id,
          amount_column: amountColumn,
          group_column: groupColumn || null,
          date_column: dateColumn || null,
          start_date: priorStartDate,
          end_date: priorEndDate,
          materiality_amount: null,
        })
        setPriorItems(priAgg.items)
      }

      setAggregated(true)
    } catch (e) {
      setAggregateError(e instanceof Error ? e.message : '집계 실패')
    } finally {
      setAggregating(false)
    }
  }

  function handleConfirm() {
    const priorMap = new Map(priorItems.map((item) => [item.name, item.amount]))
    const components: ComponentItem[] = currentItems.map((item) => ({
      id: generateId(),
      name: item.name,
      currentAmount: item.amount,
      priorAmount: priorMap.get(item.name) ?? null,
      isIndividual: item.is_individual,
      aiReason: '',
      auditorNote: '',
    }))
    onConfirm(components, startDate, endDate)
  }

  function canAdvance(): boolean {
    if (step === 1) return !!currentResult
    if (step === 2) return !!startDate && !!endDate
    if (step === 3) return !!amountColumn
    return false
  }

  const inputCls = 'flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pwc-red/20 focus:border-pwc-red'

  return (
    <div>
      {/* Step indicator */}
      <div className="flex mb-6">
        {STEPS.map((label, i) => {
          const n = i + 1
          const active = step === n
          const done = step > n
          return (
            <div key={n} className="flex-1 flex flex-col items-center gap-1 relative">
              {i > 0 && (
                <div className={`absolute top-3 right-1/2 w-full h-0.5 -translate-y-1/2
                  ${done ? 'bg-green-400' : 'bg-gray-100'}`} />
              )}
              <div className={`relative z-10 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center
                ${active ? 'bg-pwc-red text-white' : done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs text-center ${active ? 'text-pwc-dark font-semibold' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold text-pwc-dark">ZIP 파일 업로드</h3>
          <ZipDropzone label="당기 ZIP" required file={currentFile} result={currentResult}
            uploading={uploadingCurrent} error={currentError} onFile={handleCurrentFile} />
          <ZipDropzone label="전기 ZIP (선택)" file={priorFile} result={priorResult}
            uploading={uploadingPrior} error={priorError} onFile={handlePriorFile} />
          {!priorResult && (
            <p className="text-xs text-gray-400">전기 ZIP을 업로드하지 않으면 전기 금액을 확정 후 테이블에서 직접 입력합니다.</p>
          )}
        </div>
      )}

      {/* Step 2: Period */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold text-pwc-dark">분석 기간 설정</h3>
          <div>
            <label className="block text-sm font-medium text-pwc-dark mb-1">
              당기 분석 기간 <span className="text-pwc-red">*</span>
            </label>
            <div className="flex gap-2 items-center">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
              <span className="text-gray-400 text-sm shrink-0">~</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          {priorResult && (
            <div>
              <label className="block text-sm font-medium text-pwc-dark mb-1">전기 분석 기간</label>
              <div className="flex gap-2 items-center">
                <input type="date" value={priorStartDate} onChange={(e) => setPriorStartDate(e.target.value)} className={inputCls} />
                <span className="text-gray-400 text-sm shrink-0">~</span>
                <input type="date" value={priorEndDate} onChange={(e) => setPriorEndDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}
          {currentResult?.file_unit !== 'unknown' && (
            <p className="text-xs text-gray-400 bg-blue-50 text-blue-600 px-3 py-2 rounded-lg">
              감지된 파일 형식: {currentResult?.file_unit === 'monthly' ? '월별' : '일별'} ({currentResult?.file_count}개)
            </p>
          )}
        </div>
      )}

      {/* Step 3: Column mapping */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold text-pwc-dark">컬럼 매핑</h3>
          <ColSelect label="금액 컬럼" required value={amountColumn} options={allColumns}
            suggested={suggestedAmount} onChange={setAmountColumn} />
          <ColSelect label="날짜 컬럼" value={dateColumn} options={allColumns}
            suggested={suggestedDate} onChange={setDateColumn} />
          {(account.analysisMode === 'auto_filter' || account.analysisMode === 'manual_define') && (
            <ColSelect
              label={account.analysisMode === 'auto_filter' ? '구성요소 구분 컬럼 (거래처 등)' : '구성요소 구분 컬럼 (선택)'}
              required={account.analysisMode === 'auto_filter'}
              value={groupColumn}
              options={allColumns}
              onChange={setGroupColumn}
            />
          )}
          <p className="text-xs text-gray-400">
            추천 컬럼: 숫자형(금액) · 날짜형(날짜) 기준으로 자동 감지됩니다.
          </p>
        </div>
      )}

      {/* Step 4: Preview */}
      {step === 4 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-pwc-dark">집계 미리보기</h3>
            <button
              onClick={handleAggregate}
              disabled={aggregating}
              className="bg-pwc-dark text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {aggregating ? '집계 중...' : '집계 실행'}
            </button>
          </div>

          {aggregateError && (
            <p className="text-sm text-red-500 mb-4 bg-red-50 px-3 py-2 rounded-lg">{aggregateError}</p>
          )}

          {!aggregated && !aggregating && (
            <p className="text-sm text-gray-400 text-center py-8">집계 실행 버튼을 클릭하세요</p>
          )}

          {aggregated && currentItems.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-left">
                    <th className="px-3 py-2 font-medium">구성요소</th>
                    <th className="px-3 py-2 font-medium text-right">당기 금액</th>
                    {priorResult && <th className="px-3 py-2 font-medium text-right">전기 금액</th>}
                    <th className="px-3 py-2 font-medium text-center">구분</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {currentItems.map((item, idx) => {
                    const priorMap = new Map(priorItems.map((p) => [p.name, p.amount]))
                    return (
                      <tr key={idx} className={!item.is_individual ? 'italic text-gray-400' : ''}>
                        <td className="px-3 py-2 font-medium text-pwc-dark">{item.name}</td>
                        <td className="px-3 py-2 text-right">{item.amount.toLocaleString('ko-KR')}</td>
                        {priorResult && (
                          <td className="px-3 py-2 text-right">
                            {priorMap.has(item.name) ? (priorMap.get(item.name) ?? 0).toLocaleString('ko-KR') : '—'}
                          </td>
                        )}
                        <td className="px-3 py-2 text-center">
                          {item.is_individual ? (
                            <span className="text-xs bg-[#E6F1FB] text-blue-600 px-2 py-0.5 rounded-full">개별분석</span>
                          ) : (
                            <span className="text-xs text-gray-400">합산</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!priorResult && (
                <p className="text-xs text-gray-400 mt-3 px-3">전기 금액은 확정 후 테이블에서 입력할 수 있습니다.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-4">
        {step > 1 && (
          <button
            onClick={() => setStep((s) => (s - 1) as typeof step)}
            className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            이전
          </button>
        )}
        <div className="flex-1" />
        {step < 4 ? (
          <button
            onClick={() => canAdvance() && setStep((s) => (s + 1) as typeof step)}
            disabled={!canAdvance()}
            className="px-5 py-2.5 bg-pwc-red text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            다음
          </button>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={!aggregated}
            className="px-5 py-2.5 bg-pwc-red text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            확정
          </button>
        )}
      </div>
    </div>
  )
}
