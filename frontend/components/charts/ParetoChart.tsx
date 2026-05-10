'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { ComponentItem } from '@/lib/types'

interface ParetoChartProps {
  components: ComponentItem[]
}

export default function ParetoChart({ components }: ParetoChartProps) {
  const sorted = [...components]
    .filter((c) => c.currentAmount !== null)
    .sort((a, b) => Math.abs(b.currentAmount ?? 0) - Math.abs(a.currentAmount ?? 0))

  const total = sorted.reduce((s, c) => s + Math.abs(c.currentAmount ?? 0), 0)

  const data = sorted.map((c, i) => {
    const abs = Math.abs(c.currentAmount ?? 0)
    const cumSum = sorted
      .slice(0, i + 1)
      .reduce((s, cc) => s + Math.abs(cc.currentAmount ?? 0), 0)
    return {
      name: c.name.length > 8 ? c.name.slice(0, 8) + '…' : c.name,
      fullName: c.name,
      amount: abs,
      cumPct: total > 0 ? Math.round((cumSum / total) * 100) : 0,
    }
  })

  const topN = Math.min(3, data.length)
  const topNPct = data.length > 0 ? (data[topN - 1]?.cumPct ?? 0) : 0

  if (data.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-6">
        당기 금액 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 40, left: 10, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            angle={-20}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickFormatter={(v) => {
              const num = typeof v === 'number' ? v : Number(v)
              return num >= 1000 ? `${Math.round(num / 1000)}K` : String(Math.round(num))
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
          />
          <Tooltip
            formatter={(value, name) => {
              const num = typeof value === 'number' ? value : Number(value)
              if (name === 'cumPct') return [`${num}%`, '누적 비중']
              return [num.toLocaleString('ko-KR'), '당기 금액']
            }}
          />
          <Bar
            yAxisId="left"
            dataKey="amount"
            fill="#E0301E"
            opacity={0.85}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumPct"
            stroke="#252525"
            strokeWidth={2}
            dot={{ r: 3, fill: '#252525' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 text-center mt-1">
        상위 {topN}개 항목이 전체 잔액의{' '}
        <span className="font-semibold text-pwc-dark">{topNPct}%</span>를 구성함
      </p>
    </div>
  )
}
