import { describe, it, expect } from 'vitest'
import { generateId, fmtNumber, formatAmountInput, fmtDate } from './utils'

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string')
    expect(generateId().length).toBeGreaterThan(0)
  })

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, generateId))
    expect(ids.size).toBe(100)
  })
})

describe('fmtNumber', () => {
  it('formats positive numbers with Korean locale', () => {
    expect(fmtNumber(1234567)).toBe('1,234,567')
  })

  it('returns em dash for null', () => {
    expect(fmtNumber(null)).toBe('—')
  })

  it('returns em dash for undefined', () => {
    expect(fmtNumber(undefined)).toBe('—')
  })

  it('formats zero', () => {
    expect(fmtNumber(0)).toBe('0')
  })

  it('formats negative numbers', () => {
    const result = fmtNumber(-5000)
    expect(result).toContain('5,000')
  })
})

describe('formatAmountInput', () => {
  it('strips non-digits and formats', () => {
    expect(formatAmountInput('1,234')).toBe('1,234')
  })

  it('converts plain digits', () => {
    expect(formatAmountInput('1234567')).toBe('1,234,567')
  })

  it('returns empty string for empty input', () => {
    expect(formatAmountInput('')).toBe('')
  })

  it('ignores non-numeric characters', () => {
    expect(formatAmountInput('abc')).toBe('')
  })
})

describe('fmtDate', () => {
  it('converts dashes to dots', () => {
    expect(fmtDate('2024-03-15')).toBe('2024.03.15')
  })

  it('returns empty string for null', () => {
    expect(fmtDate(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(fmtDate(undefined)).toBe('')
  })
})
