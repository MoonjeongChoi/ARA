'use client'

import Link from 'next/link'
import { Project } from '@/lib/types'
import { fmtDate } from '@/lib/utils'

interface Props {
  project: Project
  onDelete: (id: string) => void
}

export default function ProjectCard({ project, onDelete }: Props) {
  const total = project.accounts.length
  const completed = project.accounts.filter((a) => a.status === '완료').length

  const progressColor =
    total === 0
      ? 'bg-gray-100 text-gray-400'
      : completed === total
      ? 'bg-green-50 text-green-700'
      : completed > 0
      ? 'bg-yellow-50 text-yellow-700'
      : 'bg-gray-100 text-gray-500'

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (confirm(`"${project.companyName}" 프로젝트를 삭제하시겠습니까?`)) {
      onDelete(project.id)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <Link href={`/projects/${project.id}`} className="block p-6">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-pwc-dark truncate">{project.companyName}</h3>
            <span className="text-sm text-gray-400">{project.fiscalYear}년도</span>
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${progressColor}`}>
            {total === 0 ? '계정 없음' : `${completed}/${total} 완료`}
          </span>
        </div>

        <dl className="space-y-1 text-xs text-gray-500">
          <div className="flex gap-2">
            <dt className="text-gray-400 shrink-0 whitespace-nowrap">당기</dt>
            <dd>{fmtDate(project.currentPeriod.start)} ~ {fmtDate(project.currentPeriod.end)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-400 shrink-0 whitespace-nowrap">전기</dt>
            <dd>{fmtDate(project.priorPeriod.start)} ~ {fmtDate(project.priorPeriod.end)}</dd>
          </div>
          {project.materialityAmount > 0 && (
            <div className="flex gap-2">
              <dt className="text-gray-400 shrink-0 whitespace-nowrap">중요성 금액</dt>
              <dd>{project.materialityAmount.toLocaleString('ko-KR')}천원</dd>
            </div>
          )}
        </dl>
      </Link>

      <div className="flex items-center justify-between px-6 py-3 border-t border-gray-50">
        <span className="text-xs text-gray-400">계정과목 {total}개</span>
        <button
          onClick={handleDelete}
          className="text-xs text-gray-400 hover:text-pwc-red transition-colors"
        >
          삭제
        </button>
      </div>
    </div>
  )
}
