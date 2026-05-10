'use client'

import { useState } from 'react'
import { Account, AccountFilter, AccountType, AnalysisMode, InputMethod, Project } from '@/lib/types'
import { generateId, formatAmountInput } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface Props {
  project: Project
  onClose: () => void
  onAdd: (account: Account) => void
}

const ACCOUNT_TYPES: AccountType[] = ['자산', '부채', '자본', '수익', '비용']
const TOTAL_STEPS = 4

export default function AddAccountModal({ project, onClose, onAdd }: Props) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('자산')
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('auto_filter')
  const [inputMethod] = useState<InputMethod>('zip')
  const [materialityDisplay, setMaterialityDisplay] = useState(
    project.materialityAmount > 0 ? project.materialityAmount.toLocaleString('ko-KR') : ''
  )
  const [nameError, setNameError] = useState('')
  const [accountFilters, setAccountFilters] = useState<AccountFilter[]>([])

  function canNext(): boolean {
    if (step === 1) {
      if (!name.trim()) { setNameError('계정과목명을 입력하세요.'); return false }
      setNameError('')
    }
    return true
  }

  function handleNext() {
    if (!canNext()) return
    setStep((s) => Math.min(s + 1, TOTAL_STEPS) as typeof step)
  }

  function handleSubmit() {
    const matRaw = materialityDisplay.replace(/[^0-9]/g, '')
    const account: Account = {
      id: generateId(),
      name: name.trim(),
      type,
      analysisMode,
      inputMethod,
      materialityAmount: matRaw ? Number(matRaw) : null,
      status: '미작성',
      components: [],
      aiSummary: '',
      auditorMemo: '',
      analysisPeriod: null,
      accountFilters: accountFilters.filter((f) => f.code || f.name),
    }
    onAdd(account)
  }

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pwc-red/20 focus:border-pwc-red transition-colors'

  return (
    <Modal onClose={onClose}>
      <Modal.Header>계정과목 추가</Modal.Header>

      {/* Step indicator */}
      <div className="flex border-b border-gray-100">
        {['기본 정보', '분석 모드', '입력 방식', '추가 설정'].map((label, i) => {
          const n = i + 1
          const active = step === n
          const done = step > n
          return (
            <div key={n} className="flex-1 flex flex-col items-center py-3 gap-1">
              <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center
                ${active ? 'bg-pwc-red text-white' : done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs ${active ? 'text-pwc-dark font-semibold' : 'text-gray-400'}`}>{label}</span>
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <Modal.Body className="min-h-[260px]">
        {/* Step 1: 기본 정보 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-pwc-dark mb-1">
                계정과목명 <span className="text-pwc-red">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError('') }}
                placeholder="예: 매출채권, 재고자산, 매출"
                className={inputCls}
                autoFocus
              />
              {nameError && <p className="text-xs text-red-500 mt-0.5">{nameError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-pwc-dark mb-2">계정 유형</label>
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors
                      ${type === t
                        ? 'bg-pwc-red text-white border-pwc-red'
                        : 'border-gray-200 text-gray-600 hover:border-pwc-red'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Account code filters */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium text-pwc-dark">분석 대상 계정코드/계정명</label>
                <span className="text-xs text-gray-400">(선택)</span>
              </div>
              {accountFilters.map((f, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={f.code}
                    onChange={(e) => setAccountFilters(accountFilters.map((x, j) => j === i ? { ...x, code: e.target.value } : x))}
                    placeholder="계정코드 (예: 210101)"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pwc-red/20 focus:border-pwc-red"
                  />
                  <input
                    type="text"
                    value={f.name}
                    onChange={(e) => setAccountFilters(accountFilters.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    placeholder="계정명 (예: 미지급금-국내)"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pwc-red/20 focus:border-pwc-red"
                  />
                  <button
                    type="button"
                    onClick={() => setAccountFilters(accountFilters.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-400 text-lg leading-none px-1"
                  >×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAccountFilters([...accountFilters, { code: '', name: '' }])}
                className="text-sm text-pwc-red hover:underline font-medium"
              >
                + 계정 추가
              </button>
              <p className="text-xs text-gray-400 mt-1">
                분개장에 여러 계정이 섞여 있는 경우, 분석할 계정코드/계정명을 입력하세요. 비워두면 전체 대상으로 분석합니다.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: 분석 모드 */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-4">분석 기준을 선택하세요.</p>
            {[
              {
                value: 'auto_filter' as AnalysisMode,
                badge: '⚡  AUTO',
                badgeCls: 'bg-pwc-dark text-white',
                selectedCls: 'border-pwc-dark bg-gray-50',
                title: '잔액/금액 기준 자동 필터',
                desc: '업로드한 파일에서 구성요소를 자동으로 분류합니다.',
              },
              {
                value: 'manual_define' as AnalysisMode,
                badge: '✦  CUSTOM',
                badgeCls: 'bg-pwc-red text-white',
                selectedCls: 'border-pwc-red bg-red-50',
                title: '구성요소 직접 정의',
                desc: '분석 방향을 직접 지시하거나 항목을 수동으로 입력합니다.',
              },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAnalysisMode(opt.value)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-colors
                  ${analysisMode === opt.value ? opt.selectedCls : 'border-gray-100 hover:border-gray-200'}`}
              >
                <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded ${opt.badgeCls}`}>
                  {opt.badge}
                </span>
                <p className="text-sm font-semibold text-pwc-dark mt-2">{opt.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        )}

        {/* Step 3: 입력 방식 */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-4">데이터 입력 방식을 선택하세요.</p>
            <div className="w-full text-left p-4 rounded-xl border-2 border-pwc-red bg-red-50">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center border-pwc-red">
                  <div className="w-2 h-2 rounded-full bg-pwc-red" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-pwc-dark">파일 업로드 (xlsx / xls / xlsb / zip)</p>
                  <p className="text-xs text-gray-500 mt-0.5">Excel 파일 또는 여러 Excel 파일을 ZIP으로 압축하여 업로드합니다. 자동으로 파싱 및 집계합니다.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: 추가 설정 */}
        {step === 4 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-400">계정과목명</span>
                <span className="font-semibold text-pwc-dark">{name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">계정 유형</span>
                <span className="text-pwc-dark">{type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">분석 모드</span>
                <span className="text-pwc-dark">
                  {analysisMode === 'auto_filter' ? '잔액 자동 필터' : '구성요소 직접 정의'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">입력 방식</span>
                <span className="text-pwc-dark">xlsx / xls / xlsb / zip</span>
              </div>
              {accountFilters.filter((f) => f.code || f.name).length > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">계정 필터</span>
                  <span className="text-pwc-dark">{accountFilters.filter((f) => f.code || f.name).length}개 지정</span>
                </div>
              )}
            </div>

            {/* Materiality — only for auto_filter */}
            {analysisMode === 'auto_filter' && (
              <div>
                <label className="block text-sm font-medium text-pwc-dark mb-1">
                  중요성 금액{' '}
                  <span className="text-gray-400 font-normal text-xs">(천원 단위, 선택)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={materialityDisplay}
                  onChange={(e) => setMaterialityDisplay(formatAmountInput(e.target.value))}
                  placeholder={project.materialityAmount > 0 ? `프로젝트 기본값: ${project.materialityAmount.toLocaleString('ko-KR')}` : '예: 50,000'}
                  className={inputCls}
                />
                <p className="text-xs text-gray-400 mt-1">비워두면 프로젝트 기본 중요성 금액이 적용됩니다.</p>
              </div>
            )}
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={step === 1 ? onClose : () => setStep((s) => (s - 1) as typeof step)}
        >
          {step === 1 ? '취소' : '이전'}
        </Button>
        {step < TOTAL_STEPS ? (
          <Button type="button" variant="primary" className="flex-1" onClick={handleNext}>
            다음
          </Button>
        ) : (
          <Button type="button" variant="primary" className="flex-1" onClick={handleSubmit}>
            계정과목 생성
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
