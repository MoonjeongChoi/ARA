import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  const url = `${BACKEND}/api/ai/analyze`
  try {
    const body = await req.json()
    console.log('[AI analyze] → POST', url, 'account:', body?.accountName)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    console.log('[AI analyze] ←', res.status, text.slice(0, 300))

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      console.error('[AI analyze] non-JSON response:', text)
      return NextResponse.json(
        { error: `백엔드 응답 파싱 실패 (${res.status}): ${text.slice(0, 200)}` },
        { status: 502 },
      )
    }

    if (!res.ok) {
      const detail = (data as Record<string, unknown>)?.detail ?? text
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail)
      console.error('[AI analyze] backend error', res.status, msg)
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[AI analyze] proxy error →', url, '\n', err)
    return NextResponse.json(
      { error: `백엔드 연결 실패 (${BACKEND}): ${msg}` },
      { status: 502 },
    )
  }
}
