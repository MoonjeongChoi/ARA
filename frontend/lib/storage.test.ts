import { describe, it, expect, beforeEach } from 'vitest'
import { storage } from './storage'
import type { Project } from './types'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    companyName: 'Test Co',
    fiscalYear: 2024,
    currentPeriod: { start: '2024-01-01', end: '2024-12-31' },
    priorPeriod: { start: '2023-01-01', end: '2023-12-31' },
    materialityAmount: 1000,
    accounts: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('storage.saveProject / getProject', () => {
  it('saves and retrieves a project', () => {
    const proj = makeProject()
    storage.saveProject(proj)
    expect(storage.getProject('proj-1')).toMatchObject({ id: 'proj-1', companyName: 'Test Co' })
  })

  it('updates existing project', () => {
    const proj = makeProject()
    storage.saveProject(proj)
    storage.saveProject({ ...proj, companyName: 'Updated Co' })
    const all = storage.getProjects()
    expect(all).toHaveLength(1)
    expect(all[0].companyName).toBe('Updated Co')
  })
})

describe('stripVolatile — journalByVendor is stripped', () => {
  it('does not persist journalByVendor to localStorage', () => {
    const proj = makeProject({
      accounts: [
        {
          id: 'acc-1',
          name: '매출채권',
          type: '자산',
          analysisMode: 'auto_filter',
          inputMethod: 'zip',
          materialityAmount: null,
          status: '완료',
          components: [],
          aiSummary: '',
          auditorMemo: '',
          analysisPeriod: null,
          journalByVendor: { '거래처A': [{ date: '2024-01-01', description: '구매', amount: 100, type: '+' }] },
        },
      ],
    })
    storage.saveProject(proj)

    const raw = localStorage.getItem('ara_projects')!
    expect(raw).not.toContain('journalByVendor')
    expect(raw).not.toContain('거래처A')
  })

  it('retrieved project has no journalByVendor', () => {
    const proj = makeProject({
      accounts: [
        {
          id: 'acc-1',
          name: '재고',
          type: '자산',
          analysisMode: 'auto_filter',
          inputMethod: 'zip',
          materialityAmount: null,
          status: '미작성',
          components: [],
          aiSummary: '',
          auditorMemo: '',
          analysisPeriod: null,
          journalByVendor: { 'VendorX': [] },
        },
      ],
    })
    storage.saveProject(proj)
    const loaded = storage.getProject('proj-1')!
    expect(loaded.accounts[0].journalByVendor).toBeUndefined()
  })
})

describe('storage.deleteProject', () => {
  it('removes project', () => {
    storage.saveProject(makeProject({ id: 'p1' }))
    storage.saveProject(makeProject({ id: 'p2' }))
    storage.deleteProject('p1')
    const all = storage.getProjects()
    expect(all.find((p) => p.id === 'p1')).toBeUndefined()
    expect(all.find((p) => p.id === 'p2')).toBeDefined()
  })
})
