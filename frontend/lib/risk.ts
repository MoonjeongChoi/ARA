import { ComponentItem } from './types'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface RiskScore {
  score: number
  level: RiskLevel
}

export function computeRiskScore(
  component: ComponentItem,
  totalCurrent: number,
  materiality?: number | null,
): RiskScore {
  let score = 0
  const prior = component.priorAmount ?? 0
  const current = component.currentAmount ?? 0
  const delta = current - prior

  // 변동률 점수: min(|변동률|, 1.0) * 30
  if (prior !== 0) {
    score += Math.min(Math.abs(delta / prior), 1.0) * 30
  } else if (current !== 0) {
    score += 30
  }

  // 비중 점수: (|currentAmount| / |totalCurrent|) * 30
  if (totalCurrent !== 0) {
    score += (Math.abs(current) / Math.abs(totalCurrent)) * 30
  }

  // 신규/소멸 +20
  if ((prior === 0 && current !== 0) || (prior !== 0 && current === 0)) {
    score += 20
  }

  // 중요성 초과 +20
  if (materiality && Math.abs(delta) > materiality) {
    score += 20
  }

  const level: RiskLevel =
    score >= 75 ? 'critical' :
    score >= 50 ? 'high' :
    score >= 25 ? 'medium' : 'low'

  return { score: Math.round(score), level }
}
