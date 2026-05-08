'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { storage } from '@/lib/storage'
import { Account, AccountStatus, AnalysisMode, InputMethod, Project } from '@/lib/types'
import { fmtDate } from '@/lib/utils'
import Header from '@/components/Header'
import AddAccountModal from '@/components/AddAccountModal'
import ExportModal from '@/components/ExportModal'

const MODE_LABEL: Record<AnalysisMode, string> = {
  auto_filter: '잔액 자동 필터',
  manual_define: '구성요소 직접 정의',
}

const METHOD_LABEL: Record<InputMethod, string> = {
  manual: '수동 입력',
  zip: 'xlsx / xls / xlsb / zip',
}

const STATUS_COLOR: Record<AccountStatus, string> = {
  '미작성': 'bg-gray-100 text-gray-500',
  '작성중': 'bg-yellow-50 text-yellow-700',
  '완료': 'bg-green-50 text-green-700',
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showExport, setShowExport] = useState(false)

  useEffect(() => {
    const p = storage.getProject(id)
    if (!p) { router.push('/'); return }
    setProject(p)
  }, [id])

  if (!project) return null

  function handleAddAccount(account: Account) {
    if (!project) return
    const updated: Project = { ...project, accounts: [...project.accounts, account] }
    storage.saveProject(updated)
    setProject(updated)
    setShowModal(false)
  }

  function handleDeleteAccount(accountId: string) {
    if (!project) return
    if (!confirm('계정과목을 삭제하시겠습니까?')) return
    const updated: Project = { ...project, accounts: project.accounts.filter((a) => a.id !== accountId) }
    storage.saveProject(updated)
    setProject(updated)
  }

  const completed = project.accounts.filter((a) => a.status === '완료').length
  const total = project.accounts.length

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <Link href="/" className="inline-flex items-center text-sm text-gray-400 hover:text-pwc-red transition-colors mb-5">
          ← 프로젝트 목록
        </Link>

        {/* Project header card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-pwc-dark">{project.companyName}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{project.fiscalYear}년도 감사</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {project.accounts.length > 0 && (
                <button
                  onClick={() => setShowExport(true)}
                  className="border border-pwc-red text-pwc-red px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors"
                >
                  Export
                </button>
              )}
              <button
                onClick={() => setShowModal(true)}
                className="bg-pwc-red text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors shadow-sm"
              >
                + 계정과목 추가
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">당기</p>
              <p className="font-medium text-pwc-dark">
                {fmtDate(project.currentPeriod.start)} ~ {fmtDate(project.currentPeriod.end)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">전기</p>
              <p className="font-medium text-pwc-dark">
                {fmtDate(project.priorPeriod.start)} ~ {fmtDate(project.priorPeriod.end)}
              </p>
            </div>
            {project.materialityAmount > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">기본 중요성 금액</p>
                <p className="font-medium text-pwc-dark">{project.materialityAmount.toLocaleString('ko-KR')}천원</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 mb-0.5">진행 현황</p>
              <p className="font-medium text-pwc-dark">
                {total === 0 ? '—' : `${completed} / ${total} 완료`}
              </p>
            </div>
          </div>
        </div>

        {/* Accounts table */}
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-base font-medium text-gray-500">계정과목이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">상단 버튼을 눌러 계정과목을 추가하세요</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pwc-dark text-white text-left">
                  <th className="px-5 py-3 font-semibold">계정과목명</th>
                  <th className="px-4 py-3 font-semibold">유형</th>
                  <th className="px-4 py-3 font-semibold">분석 모드</th>
                  <th className="px-4 py-3 font-semibold">데이터 입력</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold text-right">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {project.accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-semibold text-pwc-dark">{account.name}</td>
                    <td className="px-4 py-3 text-gray-500">{account.type}</td>
                    <td className="px-4 py-3 text-gray-500">{MODE_LABEL[account.analysisMode]}</td>
                    <td className="px-4 py-3 text-gray-500">{METHOD_LABEL[account.inputMethod]}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLOR[account.status]}`}>
                        {account.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-4">
                        <Link
                          href={`/projects/${project.id}/accounts/${account.id}`}
                          className="text-xs font-semibold text-pwc-red hover:underline"
                        >
                          열기
                        </Link>
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showModal && (
        <AddAccountModal
          project={project}
          onClose={() => setShowModal(false)}
          onAdd={handleAddAccount}
        />
      )}
      {showExport && (
        <ExportModal
          project={project}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
