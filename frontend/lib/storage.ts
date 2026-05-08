import { Project } from './types'

const STORAGE_KEY = 'ara_projects'

export class StorageQuotaError extends Error {
  constructor() {
    super('저장 공간이 부족합니다. 불필요한 프로젝트를 삭제해주세요.')
    this.name = 'StorageQuotaError'
  }
}

/** journalByVendor는 용량이 크므로 localStorage에 저장하지 않는다. */
function stripVolatile(projects: Project[]): Project[] {
  return projects.map((p) => ({
    ...p,
    accounts: p.accounts.map(({ journalByVendor: _omit, ...rest }) => rest),
  }))
}

function load(): Project[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Project[]) : []
  } catch {
    return []
  }
}

function persist(projects: Project[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripVolatile(projects)))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new StorageQuotaError()
    }
    throw e
  }
}

export const storage = {
  getProjects(): Project[] {
    return load()
  },

  getProject(id: string): Project | undefined {
    return load().find((p) => p.id === id)
  },

  saveProject(project: Project): void {
    const all = load()
    const idx = all.findIndex((p) => p.id === project.id)
    if (idx >= 0) {
      all[idx] = project
    } else {
      all.push(project)
    }
    persist(all)
  },

  deleteProject(id: string): void {
    persist(load().filter((p) => p.id !== id))
  },
}
