'use client'

import { useState } from 'react'
import { Project } from '@/lib/types'
import { generateId, formatAmountInput } from '@/lib/utils'

interface Props {
  onClose: () => void
  onCreate: (project: Project) => void
}

export default function NewProjectModal({ onClose, onCreate }: Props) {
  const currentYear = new Date().getFullYear()

  const [companyName, setCompanyName] = useState('')
  const [fiscalYear, setFiscalYear] = useState(String(currentYear))
  const [currentStart, setCurrentStart] = useState(`${currentYear}-01-01`)
  const [currentEnd, setCurrentEnd] = useState(`${currentYear}-12-31`)
  const [priorStart, setPriorStart] = useState(`${currentYear - 1}-01-01`)
  const [priorEnd, setPriorEnd] = useState(`${currentYear - 1}-12-31`)
  const [materialityDisplay, setMaterialityDisplay] = useState('')
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})

  const clearError = (key: string) =>
    setErrors((prev) => ({ ...prev, [key]: undefined }))

  function validate(): boolean {
    const errs: Partial<Record<string, string>> = {}
    if (!companyName.trim()) errs.companyName = '회사명을 입력하세요.'
    if (!fiscalYear || isNaN(Number(fiscalYear))) errs.fiscalYear = '올바른 연도를 입력하세요.'
    if (!currentStart) errs.currentStart = '당기 시작일을 입력하세요.'
    if (!currentEnd) errs.currentEnd = '당기 종료일을 입력하세요.'
    if (currentStart && currentEnd && currentStart > currentEnd)
      errs.currentEnd = '종료일이 시작일보다 앞설 수 없습니다.'
    if (!priorStart) errs.priorStart = '전기 시작일을 입력하세요.'
    if (!priorEnd) errs.priorEnd = '전기 종료일을 입력하세요.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const materialityRaw = materialityDisplay.replace(/[^0-9]/g, '')
    const project: Project = {
      id: generateId(),
      companyName: companyName.trim(),
      fiscalYear: Number(fiscalYear),
      currentPeriod: { start: currentStart, end: currentEnd },
      priorPeriod: { start: priorStart, end: priorEnd },
      materialityAmount: materialityRaw ? Number(materialityRaw) : 0,
      accounts: [],
      createdAt: new Date().toISOString(),
    }
    onCreate(project)
  }

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pwc-red/20 focus:border-pwc-red transition-colors'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-pwc-dark px-6 py-4">
          <h2 className="text-base font-bold text-white">새 프로젝트 생성</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          <div>
            <label className="block text-sm font-medium text-pwc-dark mb-1">
              회사명 <span className="text-pwc-red">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => { setCompanyName(e.target.value); clearError('companyName') }}
              placeholder="예: (주)가나전자"
              className={inputCls}
            />
            {errors.companyName && <p className="text-xs text-red-500 mt-0.5">{errors.companyName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-pwc-dark mb-1">
              회계연도 <span className="text-pwc-red">*</span>
            </label>
            <input
              type="number"
              value={fiscalYear}
              onChange={(e) => { setFiscalYear(e.target.value); clearError('fiscalYear') }}
              min={2000}
              max={2100}
              className={inputCls}
            />
            {errors.fiscalYear && <p className="text-xs text-red-500 mt-0.5">{errors.fiscalYear}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-pwc-dark mb-1">
              당기 보고기간 <span className="text-pwc-red">*</span>
            </label>
            <div className="flex gap-2 items-center">
              <input type="date" value={currentStart}
                onChange={(e) => { setCurrentStart(e.target.value); clearError('currentStart') }}
                className={`flex-1 ${inputCls}`} />
              <span className="text-gray-400 text-sm shrink-0">~</span>
              <input type="date" value={currentEnd}
                onChange={(e) => { setCurrentEnd(e.target.value); clearError('currentEnd') }}
                className={`flex-1 ${inputCls}`} />
            </div>
            {(errors.currentStart || errors.currentEnd) && (
              <p className="text-xs text-red-500 mt-0.5">{errors.currentStart || errors.currentEnd}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-pwc-dark mb-1">
              전기 보고기간 <span className="text-pwc-red">*</span>
            </label>
            <div className="flex gap-2 items-center">
              <input type="date" value={priorStart}
                onChange={(e) => { setPriorStart(e.target.value); clearError('priorStart') }}
                className={`flex-1 ${inputCls}`} />
              <span className="text-gray-400 text-sm shrink-0">~</span>
              <input type="date" value={priorEnd}
                onChange={(e) => { setPriorEnd(e.target.value); clearError('priorEnd') }}
                className={`flex-1 ${inputCls}`} />
            </div>
            {(errors.priorStart || errors.priorEnd) && (
              <p className="text-xs text-red-500 mt-0.5">{errors.priorStart || errors.priorEnd}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-pwc-dark mb-1">
              기본 중요성 금액{' '}
              <span className="text-gray-400 font-normal text-xs">(천원 단위, 선택)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={materialityDisplay}
              onChange={(e) => setMaterialityDisplay(formatAmountInput(e.target.value))}
              placeholder="예: 50,000"
              className={inputCls}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              취소
            </button>
            <button type="submit"
              className="flex-1 bg-pwc-red text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
              프로젝트 생성
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
