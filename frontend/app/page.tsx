'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import NewProjectModal from '@/components/NewProjectModal'
import ProjectCard from '@/components/ProjectCard'
import { storage } from '@/lib/storage'
import { Project } from '@/lib/types'

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    setProjects(storage.getProjects())
  }, [])

  function handleCreate(project: Project) {
    storage.saveProject(project)
    setProjects(storage.getProjects())
    setShowModal(false)
  }

  function handleDelete(id: string) {
    storage.deleteProject(id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Page title row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-pwc-dark">프로젝트 목록</h2>
            <p className="text-sm text-gray-400 mt-1">
              {projects.length > 0
                ? `총 ${projects.length}개 프로젝트`
                : '새 프로젝트를 생성하여 분석을 시작하세요'}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-pwc-red text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors shadow-sm"
          >
            + 새 프로젝트
          </button>
        </div>

        {/* Empty state */}
        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg
                className="w-7 h-7 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-base font-medium text-gray-500">프로젝트가 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">
              상단 버튼을 눌러 첫 번째 프로젝트를 생성하세요
            </p>
          </div>
        )}

        {/* Project grid */}
        {projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <NewProjectModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}
